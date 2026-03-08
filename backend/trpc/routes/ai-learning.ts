import * as z from "zod";
import { createTRPCRouter, adminProcedure, publicProcedure } from "../create-context";
import { store } from "../../store/index";

function computeStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const sqDiffs = values.map(v => Math.pow(v - avg, 2));
  return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / values.length);
}

function periodToMs(period: string): number {
  switch (period) {
    case "1h": return 60 * 60 * 1000;
    case "24h": return 24 * 60 * 60 * 1000;
    case "7d": return 7 * 24 * 60 * 60 * 1000;
    case "30d": return 30 * 24 * 60 * 60 * 1000;
    case "90d": return 90 * 24 * 60 * 60 * 1000;
    case "all": return 365 * 10 * 24 * 60 * 60 * 1000;
    default: return 30 * 24 * 60 * 60 * 1000;
  }
}

export const aiLearningRouter = createTRPCRouter({
  runLearningCycle: adminProcedure
    .input(z.object({
      period: z.enum(["1h", "24h", "7d", "30d", "90d", "all"]).default("30d"),
    }))
    .mutation(async ({ input }) => {
      console.log("[AI Brain] Running learning cycle for period:", input.period);
      const now = Date.now();
      const cutoff = now - periodToMs(input.period);

      const events = store.analyticsEvents.filter(
        e => new Date(e.timestamp).getTime() >= cutoff
      );
      const landingEvents = events.filter(e => e.userId === "landing_visitor");
      const appEvents = events.filter(e => e.userId !== "landing_visitor");

      const newLearnings: typeof store.aiLearnings = [];
      const genId = () => store.genId("ai_learn");

      const sessionMap = new Map<string, {
        events: typeof events;
        firstSeen: number;
        lastSeen: number;
        hasFormSubmit: boolean;
        hasCta: boolean;
        hasScroll75: boolean;
        device: string;
        geo?: { country?: string; city?: string };
      }>();

      landingEvents.forEach(e => {
        let sess = sessionMap.get(e.sessionId);
        if (!sess) {
          sess = {
            events: [],
            firstSeen: new Date(e.timestamp).getTime(),
            lastSeen: new Date(e.timestamp).getTime(),
            hasFormSubmit: false,
            hasCta: false,
            hasScroll75: false,
            device: (e.properties?.device as string) || "Unknown",
            geo: e.geo ? { country: e.geo.country, city: e.geo.city } : undefined,
          };
          sessionMap.set(e.sessionId, sess);
        }
        sess.events.push(e);
        const ts = new Date(e.timestamp).getTime();
        if (ts < sess.firstSeen) sess.firstSeen = ts;
        if (ts > sess.lastSeen) sess.lastSeen = ts;
        if (!sess.geo && e.geo) sess.geo = { country: e.geo.country, city: e.geo.city };
        if (e.event === "form_submit") sess.hasFormSubmit = true;
        if (e.event.startsWith("cta_")) sess.hasCta = true;
        if (e.event === "scroll_75" || e.event === "scroll_100") sess.hasScroll75 = true;
      });

      // --- PATTERN: Traffic volume patterns ---
      const hourlyCounts = new Array(24).fill(0) as number[];
      const dayOfWeekCounts = new Array(7).fill(0) as number[];
      landingEvents.forEach(e => {
        const d = new Date(e.timestamp);
        hourlyCounts[d.getHours()]++;
        dayOfWeekCounts[d.getDay()]++;
      });

      const peakHour = hourlyCounts.indexOf(Math.max(...hourlyCounts));
      const lowHour = hourlyCounts.indexOf(Math.min(...hourlyCounts.filter(c => c > 0)));
      const peakDay = dayOfWeekCounts.indexOf(Math.max(...dayOfWeekCounts));
      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

      if (landingEvents.length > 5) {
        const hourlyStdDev = computeStdDev(hourlyCounts);
        const hourlyAvg = hourlyCounts.reduce((a, b) => a + b, 0) / 24;
        const peakRatio = hourlyAvg > 0 ? hourlyCounts[peakHour] / hourlyAvg : 0;

        newLearnings.push({
          id: genId(),
          type: "pattern",
          category: "traffic_timing",
          title: `Peak traffic at ${peakHour}:00 on ${dayNames[peakDay]}s`,
          description: `Traffic peaks at ${peakHour}:00 (${hourlyCounts[peakHour]} events) — ${peakRatio.toFixed(1)}x above average. Lowest activity at ${lowHour}:00. Schedule campaigns before ${peakHour}:00 for maximum reach.`,
          confidence: Math.min(95, 40 + Math.round(landingEvents.length / 3)),
          impact: peakRatio > 3 ? "high" : "medium",
          dataPoints: landingEvents.length,
          metadata: { peakHour, lowHour, peakDay: dayNames[peakDay], peakRatio, hourlyStdDev, hourlyCounts },
          learnedAt: new Date().toISOString(),
          expiresAt: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
          isActive: true,
        });
      }

      // --- PATTERN: Conversion journey analysis ---
      const totalSessions = sessionMap.size;
      if (totalSessions > 3) {
        const convertedSessions = Array.from(sessionMap.values()).filter(s => s.hasFormSubmit);
        const nonConverted = Array.from(sessionMap.values()).filter(s => !s.hasFormSubmit);

        const convDurations = convertedSessions.map(s => (s.lastSeen - s.firstSeen) / 1000);
        const nonConvDurations = nonConverted.map(s => (s.lastSeen - s.firstSeen) / 1000).filter(d => d > 0);

        const avgConvDuration = convDurations.length > 0 ? convDurations.reduce((a, b) => a + b, 0) / convDurations.length : 0;
        const avgNonConvDuration = nonConvDurations.length > 0 ? nonConvDurations.reduce((a, b) => a + b, 0) / nonConvDurations.length : 0;

        const convEventCounts = convertedSessions.map(s => s.events.length);
        const avgConvEvents = convEventCounts.length > 0 ? convEventCounts.reduce((a, b) => a + b, 0) / convEventCounts.length : 0;

        if (convertedSessions.length > 0) {
          newLearnings.push({
            id: genId(),
            type: "pattern",
            category: "conversion_journey",
            title: `Converters spend ${Math.round(avgConvDuration)}s with ${Math.round(avgConvEvents)} interactions`,
            description: `Converting visitors average ${Math.round(avgConvDuration)}s on page with ${Math.round(avgConvEvents)} events. Non-converters average only ${Math.round(avgNonConvDuration)}s. The ${Math.round(avgConvDuration - avgNonConvDuration)}s gap reveals the engagement threshold for conversion.`,
            confidence: Math.min(90, 50 + convertedSessions.length * 5),
            impact: "high",
            dataPoints: totalSessions,
            metadata: { avgConvDuration, avgNonConvDuration, avgConvEvents, convertedCount: convertedSessions.length, totalSessions },
            learnedAt: new Date().toISOString(),
            expiresAt: new Date(now + 14 * 24 * 60 * 60 * 1000).toISOString(),
            isActive: true,
          });
        }

        const convRate = totalSessions > 0 ? (convertedSessions.length / totalSessions) * 100 : 0;

        // Detect if conversion rate is changing
        const recentCutoff = now - periodToMs(input.period) / 2;
        const recentSessions = Array.from(sessionMap.entries()).filter(([, s]) => s.lastSeen >= recentCutoff);
        const olderSessions = Array.from(sessionMap.entries()).filter(([, s]) => s.lastSeen < recentCutoff);
        const recentConvRate = recentSessions.length > 0
          ? (recentSessions.filter(([, s]) => s.hasFormSubmit).length / recentSessions.length) * 100
          : 0;
        const olderConvRate = olderSessions.length > 0
          ? (olderSessions.filter(([, s]) => s.hasFormSubmit).length / olderSessions.length) * 100
          : 0;

        if (olderSessions.length > 2 && recentSessions.length > 2) {
          const direction = recentConvRate > olderConvRate ? "up" : recentConvRate < olderConvRate ? "down" : "stable";
          const changeAmt = Math.abs(recentConvRate - olderConvRate);

          if (changeAmt > 1) {
            newLearnings.push({
              id: genId(),
              type: "trend",
              category: "conversion_trend",
              title: `Conversion rate trending ${direction} (${changeAmt.toFixed(1)}% shift)`,
              description: direction === "up"
                ? `Conversion rate improved from ${olderConvRate.toFixed(1)}% to ${recentConvRate.toFixed(1)}%. Whatever changes were made recently are working. Keep this momentum.`
                : `Conversion rate dropped from ${olderConvRate.toFixed(1)}% to ${recentConvRate.toFixed(1)}%. Review recent page changes, load times, or traffic sources for issues.`,
              confidence: Math.min(85, 40 + Math.round(totalSessions / 2)),
              impact: changeAmt > 5 ? "critical" : changeAmt > 2 ? "high" : "medium",
              dataPoints: totalSessions,
              metadata: { recentConvRate, olderConvRate, direction, changeAmt, convRate },
              learnedAt: new Date().toISOString(),
              expiresAt: new Date(now + 3 * 24 * 60 * 60 * 1000).toISOString(),
              isActive: true,
            });
          }

          store.updateAIMemory({
            predictedTrends: [
              ...(store.aiMemory.predictedTrends || []).filter(t => t.metric !== "conversion_rate").slice(-20),
              { metric: "conversion_rate", direction, confidence: Math.min(85, 40 + Math.round(totalSessions / 2)), predictedAt: new Date().toISOString() },
            ],
          });
        }
      }

      // --- PATTERN: Geographic intelligence ---
      const geoMap: Record<string, { sessions: number; conversions: number; avgEvents: number; totalEvents: number }> = {};
      sessionMap.forEach(sess => {
        const country = sess.geo?.country || "Unknown";
        if (!geoMap[country]) geoMap[country] = { sessions: 0, conversions: 0, avgEvents: 0, totalEvents: 0 };
        geoMap[country].sessions++;
        geoMap[country].totalEvents += sess.events.length;
        if (sess.hasFormSubmit) geoMap[country].conversions++;
      });
      Object.values(geoMap).forEach(g => { g.avgEvents = g.sessions > 0 ? g.totalEvents / g.sessions : 0; });

      const topGeos = Object.entries(geoMap)
        .filter(([c]) => c !== "Unknown")
        .sort((a, b) => b[1].sessions - a[1].sessions)
        .slice(0, 5);

      if (topGeos.length > 0) {
        const bestConverting = topGeos
          .filter(([, g]) => g.sessions >= 2)
          .sort((a, b) => (b[1].conversions / b[1].sessions) - (a[1].conversions / a[1].sessions))[0];

        if (bestConverting && bestConverting[1].conversions > 0) {
          const [country, data] = bestConverting;
          const cvr = ((data.conversions / data.sessions) * 100).toFixed(1);
          newLearnings.push({
            id: genId(),
            type: "recommendation",
            category: "geo_targeting",
            title: `${country} has ${cvr}% conversion — best market`,
            description: `${country} converts at ${cvr}% (${data.conversions}/${data.sessions} sessions) with avg ${data.avgEvents.toFixed(0)} events/session. Increase ad spend in this market and consider localized content to boost further.`,
            confidence: Math.min(88, 45 + data.sessions * 3),
            impact: "high",
            dataPoints: data.sessions,
            metadata: { country, conversionRate: parseFloat(cvr), sessions: data.sessions, conversions: data.conversions },
            learnedAt: new Date().toISOString(),
            expiresAt: new Date(now + 14 * 24 * 60 * 60 * 1000).toISOString(),
            isActive: true,
          });
        }
      }

      // --- PATTERN: Device behavior differences ---
      const deviceMap: Record<string, { sessions: number; conversions: number; avgDuration: number; durations: number[] }> = {};
      sessionMap.forEach(sess => {
        const d = sess.device || "Unknown";
        if (!deviceMap[d]) deviceMap[d] = { sessions: 0, conversions: 0, avgDuration: 0, durations: [] };
        deviceMap[d].sessions++;
        if (sess.hasFormSubmit) deviceMap[d].conversions++;
        const dur = (sess.lastSeen - sess.firstSeen) / 1000;
        if (dur > 0) deviceMap[d].durations.push(dur);
      });
      Object.values(deviceMap).forEach(d => {
        d.avgDuration = d.durations.length > 0 ? d.durations.reduce((a, b) => a + b, 0) / d.durations.length : 0;
      });

      const deviceEntries = Object.entries(deviceMap).filter(([, d]) => d.sessions >= 2);
      if (deviceEntries.length > 1) {
        const sorted = deviceEntries.sort((a, b) => (b[1].conversions / b[1].sessions) - (a[1].conversions / a[1].sessions));
        const bestDevice = sorted[0];
        const worstDevice = sorted[sorted.length - 1];
        if (bestDevice && worstDevice && bestDevice[0] !== worstDevice[0]) {
          const bestCvr = ((bestDevice[1].conversions / bestDevice[1].sessions) * 100).toFixed(1);
          const worstCvr = ((worstDevice[1].conversions / worstDevice[1].sessions) * 100).toFixed(1);
          newLearnings.push({
            id: genId(),
            type: "recommendation",
            category: "device_optimization",
            title: `${bestDevice[0]} converts ${bestCvr}% vs ${worstDevice[0]} at ${worstCvr}%`,
            description: `${bestDevice[0]} users convert at ${bestCvr}% (avg ${Math.round(bestDevice[1].avgDuration)}s on page). ${worstDevice[0]} users at ${worstCvr}% (avg ${Math.round(worstDevice[1].avgDuration)}s). Optimize the ${worstDevice[0]} experience to close this gap.`,
            confidence: Math.min(82, 40 + totalSessions * 2),
            impact: "medium",
            dataPoints: totalSessions,
            metadata: { bestDevice: bestDevice[0], worstDevice: worstDevice[0], deviceMap },
            learnedAt: new Date().toISOString(),
            expiresAt: new Date(now + 14 * 24 * 60 * 60 * 1000).toISOString(),
            isActive: true,
          });
        }
      }

      // --- ANOMALY: Unusual traffic spikes ---
      const dailyCounts: Record<string, number> = {};
      landingEvents.forEach(e => {
        const day = e.timestamp.slice(0, 10);
        dailyCounts[day] = (dailyCounts[day] || 0) + 1;
      });
      const dailyValues = Object.values(dailyCounts);
      if (dailyValues.length >= 5) {
        const dailyAvg = dailyValues.reduce((a, b) => a + b, 0) / dailyValues.length;
        const dailyStd = computeStdDev(dailyValues);
        const today = new Date().toISOString().slice(0, 10);
        const todayCount = dailyCounts[today] || 0;

        if (dailyStd > 0 && todayCount > dailyAvg + 2 * dailyStd) {
          newLearnings.push({
            id: genId(),
            type: "anomaly",
            category: "traffic_spike",
            title: `Traffic spike detected: ${todayCount} events today (${((todayCount / dailyAvg) * 100 - 100).toFixed(0)}% above normal)`,
            description: `Today's traffic of ${todayCount} events is significantly above the daily average of ${Math.round(dailyAvg)}. This could indicate a viral social post, a campaign going live, or external media coverage. Monitor conversion quality.`,
            confidence: Math.min(92, 60 + Math.round((todayCount - dailyAvg) / dailyStd * 10)),
            impact: "critical",
            dataPoints: dailyValues.length,
            metadata: { todayCount, dailyAvg, dailyStd, zScore: (todayCount - dailyAvg) / dailyStd },
            learnedAt: new Date().toISOString(),
            expiresAt: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
            isActive: true,
          });
        }
      }

      // --- PATTERN: Scroll engagement drop-off analysis ---
      const scrollEvents: Record<string, number> = { scroll_25: 0, scroll_50: 0, scroll_75: 0, scroll_100: 0 };
      let pageViews = 0;
      landingEvents.forEach(e => {
        if (e.event === "landing_page_view") pageViews++;
        if (scrollEvents[e.event] !== undefined) scrollEvents[e.event]++;
      });

      if (pageViews > 5) {
        const scroll25Pct = (scrollEvents.scroll_25 / pageViews) * 100;
        const scroll50Pct = (scrollEvents.scroll_50 / pageViews) * 100;
        const scroll75Pct = (scrollEvents.scroll_75 / pageViews) * 100;
        const biggestDrop = Math.max(
          scroll25Pct > 0 ? 100 - scroll25Pct : 0,
          scroll25Pct - scroll50Pct,
          scroll50Pct - scroll75Pct
        );

        let dropPoint = "before 25%";
        if (biggestDrop === scroll25Pct - scroll50Pct) dropPoint = "between 25%-50%";
        if (biggestDrop === scroll50Pct - scroll75Pct) dropPoint = "between 50%-75%";

        newLearnings.push({
          id: genId(),
          type: "pattern",
          category: "scroll_behavior",
          title: `Biggest engagement drop: ${dropPoint} (${Math.round(biggestDrop)}% lost)`,
          description: `Scroll funnel: 100% → ${Math.round(scroll25Pct)}% → ${Math.round(scroll50Pct)}% → ${Math.round(scroll75Pct)}%. The biggest visitor loss happens ${dropPoint}. Review content in that section — consider A/B testing headlines, visuals, or CTAs.`,
          confidence: Math.min(88, 45 + Math.round(pageViews / 2)),
          impact: biggestDrop > 40 ? "high" : "medium",
          dataPoints: pageViews,
          metadata: { pageViews, scroll25Pct, scroll50Pct, scroll75Pct, dropPoint, biggestDrop },
          learnedAt: new Date().toISOString(),
          expiresAt: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
          isActive: true,
        });
      }

      // --- PREDICTION: Next week traffic estimate ---
      if (dailyValues.length >= 7) {
        const lastWeek = dailyValues.slice(-7);
        const prevWeek = dailyValues.length >= 14 ? dailyValues.slice(-14, -7) : lastWeek;
        const lastWeekTotal = lastWeek.reduce((a, b) => a + b, 0);
        const prevWeekTotal = prevWeek.reduce((a, b) => a + b, 0);
        const growthRate = prevWeekTotal > 0 ? (lastWeekTotal - prevWeekTotal) / prevWeekTotal : 0;
        const predictedNextWeek = Math.round(lastWeekTotal * (1 + growthRate));

        newLearnings.push({
          id: genId(),
          type: "prediction",
          category: "traffic_forecast",
          title: `Predicted next week: ~${predictedNextWeek} events (${growthRate >= 0 ? "+" : ""}${(growthRate * 100).toFixed(1)}%)`,
          description: `Based on ${dailyValues.length}-day trend analysis. Last 7 days: ${lastWeekTotal} events. Previous 7 days: ${prevWeekTotal} events. Growth rate: ${(growthRate * 100).toFixed(1)}%. ${growthRate > 0 ? "Momentum is building." : growthRate < -0.1 ? "Declining trend — boost campaigns." : "Stable traffic flow."}`,
          confidence: Math.min(75, 30 + Math.round(dailyValues.length * 1.5)),
          impact: Math.abs(growthRate) > 0.2 ? "high" : "medium",
          dataPoints: dailyValues.length,
          metadata: { lastWeekTotal, prevWeekTotal, growthRate, predictedNextWeek, dailyValues },
          learnedAt: new Date().toISOString(),
          expiresAt: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
          isActive: true,
        });
      }

      // --- PATTERN: Referrer quality analysis ---
      const refMap: Record<string, { visits: number; conversions: number; scrollDepth: number[]; ctaClicks: number }> = {};
      const sessionRefs = new Map<string, string>();
      landingEvents.forEach(e => {
        if (e.event === "landing_page_view") {
          const ref = (e.properties?.referrer as string) || "direct";
          const domain = ref === "direct" || ref === "app" ? ref : (() => {
            try { return new URL(ref).hostname; } catch { return ref; }
          })();
          sessionRefs.set(e.sessionId, domain);
          if (!refMap[domain]) refMap[domain] = { visits: 0, conversions: 0, scrollDepth: [], ctaClicks: 0 };
          refMap[domain].visits++;
        }
      });

      sessionMap.forEach((sess, sid) => {
        const ref = sessionRefs.get(sid);
        if (ref && refMap[ref]) {
          if (sess.hasFormSubmit) refMap[ref].conversions++;
          if (sess.hasCta) refMap[ref].ctaClicks++;
          const maxScroll = sess.hasScroll75 ? 75 : sess.events.some(e => e.event === "scroll_50") ? 50 : 25;
          refMap[ref].scrollDepth.push(maxScroll);
        }
      });

      const qualityRefs = Object.entries(refMap)
        .filter(([, r]) => r.visits >= 3)
        .map(([source, r]) => ({
          source,
          visits: r.visits,
          conversions: r.conversions,
          cvr: r.visits > 0 ? (r.conversions / r.visits) * 100 : 0,
          avgScrollDepth: r.scrollDepth.length > 0 ? r.scrollDepth.reduce((a, b) => a + b, 0) / r.scrollDepth.length : 0,
          ctaRate: r.visits > 0 ? (r.ctaClicks / r.visits) * 100 : 0,
        }))
        .sort((a, b) => b.cvr - a.cvr);

      if (qualityRefs.length > 0) {
        const bestRef = qualityRefs[0];
        newLearnings.push({
          id: genId(),
          type: "recommendation",
          category: "traffic_source_quality",
          title: `Best traffic source: ${bestRef.source} (${bestRef.cvr.toFixed(1)}% CVR)`,
          description: `${bestRef.source} sends ${bestRef.visits} visitors with ${bestRef.cvr.toFixed(1)}% conversion rate, ${bestRef.avgScrollDepth.toFixed(0)}% avg scroll depth, and ${bestRef.ctaRate.toFixed(0)}% CTA click rate. Double down on this channel for highest ROI.`,
          confidence: Math.min(85, 40 + bestRef.visits * 2),
          impact: bestRef.cvr > 5 ? "high" : "medium",
          dataPoints: bestRef.visits,
          metadata: { qualityRefs: qualityRefs.slice(0, 5) },
          learnedAt: new Date().toISOString(),
          expiresAt: new Date(now + 14 * 24 * 60 * 60 * 1000).toISOString(),
          isActive: true,
        });
      }

      // --- APP behavior patterns ---
      if (appEvents.length > 10) {
        const screenViews: Record<string, number> = {};
        appEvents.forEach(e => {
          if (e.event === "screen_view" && e.properties?.screen) {
            const screen = e.properties.screen as string;
            screenViews[screen] = (screenViews[screen] || 0) + 1;
          }
        });

        const topScreens = Object.entries(screenViews)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5);

        if (topScreens.length > 0) {
          newLearnings.push({
            id: genId(),
            type: "pattern",
            category: "app_usage",
            title: `Most visited screen: ${topScreens[0][0]} (${topScreens[0][1]} views)`,
            description: `Top app screens: ${topScreens.map(([s, c]) => `${s} (${c})`).join(", ")}. Focus UX improvements on high-traffic screens for maximum impact.`,
            confidence: Math.min(90, 50 + appEvents.length),
            impact: "medium",
            dataPoints: appEvents.length,
            metadata: { topScreens },
            learnedAt: new Date().toISOString(),
            expiresAt: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
            isActive: true,
          });
        }
      }

      // Update behavior baselines
      const baselines: typeof store.aiMemory.behaviorBaselines = {};
      if (dailyValues.length > 0) {
        const avg = dailyValues.reduce((a, b) => a + b, 0) / dailyValues.length;
        baselines.daily_traffic = {
          avg,
          min: Math.min(...dailyValues),
          max: Math.max(...dailyValues),
          stdDev: computeStdDev(dailyValues),
          samples: dailyValues.length,
        };
      }

      const sessionDurations = Array.from(sessionMap.values())
        .map(s => (s.lastSeen - s.firstSeen) / 1000)
        .filter(d => d > 0 && d < 3600);
      if (sessionDurations.length > 0) {
        baselines.session_duration = {
          avg: sessionDurations.reduce((a, b) => a + b, 0) / sessionDurations.length,
          min: Math.min(...sessionDurations),
          max: Math.max(...sessionDurations),
          stdDev: computeStdDev(sessionDurations),
          samples: sessionDurations.length,
        };
      }

      const eventCounts = Array.from(sessionMap.values()).map(s => s.events.length);
      if (eventCounts.length > 0) {
        baselines.events_per_session = {
          avg: eventCounts.reduce((a, b) => a + b, 0) / eventCounts.length,
          min: Math.min(...eventCounts),
          max: Math.max(...eventCounts),
          stdDev: computeStdDev(eventCounts),
          samples: eventCounts.length,
        };
      }

      // Store all learnings
      newLearnings.forEach(l => store.addAILearning(l));

      // Update AI memory
      store.updateAIMemory({
        learningCycles: (store.aiMemory.learningCycles || 0) + 1,
        lastLearningCycle: new Date().toISOString(),
        totalDataPointsProcessed: (store.aiMemory.totalDataPointsProcessed || 0) + events.length,
        behaviorBaselines: { ...store.aiMemory.behaviorBaselines, ...baselines },
      });

      // Update known patterns
      const knownPatterns = { ...store.aiMemory.knownPatterns };
      newLearnings.forEach(l => {
        const key = `${l.type}_${l.category}`;
        if (!knownPatterns[key]) knownPatterns[key] = { count: 0, lastSeen: "", confidence: 0 };
        knownPatterns[key].count++;
        knownPatterns[key].lastSeen = l.learnedAt;
        knownPatterns[key].confidence = Math.max(knownPatterns[key].confidence, l.confidence);
      });
      store.updateAIMemory({ knownPatterns });

      console.log(`[AI Brain] Learning cycle complete: ${newLearnings.length} new learnings from ${events.length} events`);

      return {
        success: true,
        newLearnings: newLearnings.length,
        totalDataPoints: events.length,
        learningCycleNumber: store.aiMemory.learningCycles,
        learnings: newLearnings.map(l => ({
          id: l.id,
          type: l.type,
          category: l.category,
          title: l.title,
          description: l.description,
          confidence: l.confidence,
          impact: l.impact,
          dataPoints: l.dataPoints,
        })),
      };
    }),

  getAIBrainStatus: publicProcedure
    .query(async () => {
      console.log("[AI Brain] Getting brain status");

      const activeLearnings = store.aiLearnings.filter(l => l.isActive && new Date(l.expiresAt) > new Date());
      const expiredCount = store.aiLearnings.filter(l => new Date(l.expiresAt) <= new Date()).length;

      const byType: Record<string, number> = {};
      const byCategory: Record<string, number> = {};
      const byImpact: Record<string, number> = {};

      activeLearnings.forEach(l => {
        byType[l.type] = (byType[l.type] || 0) + 1;
        byCategory[l.category] = (byCategory[l.category] || 0) + 1;
        byImpact[l.impact] = (byImpact[l.impact] || 0) + 1;
      });

      const avgConfidence = activeLearnings.length > 0
        ? Math.round(activeLearnings.reduce((sum, l) => sum + l.confidence, 0) / activeLearnings.length)
        : 0;

      const recentLearnings = activeLearnings
        .sort((a, b) => new Date(b.learnedAt).getTime() - new Date(a.learnedAt).getTime())
        .slice(0, 30)
        .map(l => ({
          id: l.id,
          type: l.type,
          category: l.category,
          title: l.title,
          description: l.description,
          confidence: l.confidence,
          impact: l.impact,
          dataPoints: l.dataPoints,
          learnedAt: l.learnedAt,
          expiresAt: l.expiresAt,
        }));

      const topRecommendations = activeLearnings
        .filter(l => l.type === "recommendation")
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 10)
        .map(l => ({
          id: l.id,
          title: l.title,
          description: l.description,
          confidence: l.confidence,
          impact: l.impact,
          category: l.category,
        }));

      const activePredictions = activeLearnings
        .filter(l => l.type === "prediction")
        .sort((a, b) => new Date(b.learnedAt).getTime() - new Date(a.learnedAt).getTime())
        .slice(0, 5)
        .map(l => ({
          id: l.id,
          title: l.title,
          description: l.description,
          confidence: l.confidence,
          metadata: l.metadata,
        }));

      const activeAnomalies = activeLearnings
        .filter(l => l.type === "anomaly")
        .sort((a, b) => new Date(b.learnedAt).getTime() - new Date(a.learnedAt).getTime())
        .slice(0, 5)
        .map(l => ({
          id: l.id,
          title: l.title,
          description: l.description,
          confidence: l.confidence,
          impact: l.impact,
        }));

      return {
        status: activeLearnings.length > 0 ? "active" as const : "learning" as const,
        memory: {
          totalPatternsLearned: store.aiMemory.totalPatternsLearned,
          totalDataPointsProcessed: store.aiMemory.totalDataPointsProcessed,
          lastLearningCycle: store.aiMemory.lastLearningCycle,
          learningCycles: store.aiMemory.learningCycles,
          knownPatternsCount: Object.keys(store.aiMemory.knownPatterns).length,
          baselinesCount: Object.keys(store.aiMemory.behaviorBaselines).length,
          predictedTrends: store.aiMemory.predictedTrends.slice(-5),
        },
        stats: {
          activeLearnings: activeLearnings.length,
          expiredLearnings: expiredCount,
          totalLearnings: store.aiLearnings.length,
          avgConfidence,
          byType,
          byCategory,
          byImpact,
        },
        recentLearnings,
        topRecommendations,
        activePredictions,
        activeAnomalies,
        baselines: store.aiMemory.behaviorBaselines,
        lastUpdated: new Date().toISOString(),
      };
    }),

  dismissLearning: adminProcedure
    .input(z.object({ learningId: z.string() }))
    .mutation(async ({ input }) => {
      const learning = store.aiLearnings.find(l => l.id === input.learningId);
      if (learning) {
        learning.isActive = false;
        console.log(`[AI Brain] Dismissed learning: ${learning.title}`);
      }
      return { success: true };
    }),

  syncAppEvents: publicProcedure
    .input(z.object({
      events: z.array(z.object({
        name: z.string(),
        category: z.string(),
        properties: z.record(z.string(), z.unknown()).optional(),
        timestamp: z.number(),
        sessionId: z.string(),
        platform: z.string(),
      })),
    }))
    .mutation(async ({ input }) => {
      console.log(`[AI Brain] Syncing ${input.events.length} app events`);
      let synced = 0;

      for (const evt of input.events) {
        store.addAnalyticsEvent({
          id: store.genId("app_evt"),
          userId: "app_user",
          event: evt.name,
          category: evt.category,
          properties: evt.properties || {},
          sessionId: evt.sessionId,
          timestamp: new Date(evt.timestamp).toISOString(),
        });
        synced++;
      }

      const shouldLearn = store.aiMemory.totalDataPointsProcessed > 0 &&
        (store.aiMemory.totalDataPointsProcessed % 50 === 0 || synced >= 10);

      return { success: true, synced, shouldTriggerLearning: shouldLearn };
    }),
});
