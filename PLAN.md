# Traffic Intelligence & World Origin Mapping — New Control Tower Tab

## Overview

Add a **Traffic** tab to the existing Nerve Center (Control Tower) screen that provides live visibility into where users come from, how they move through the landing page and app, what they intend to do, and where they drop off — displayed as a node-graph world-origin map with real-time metrics.

## Progress

- [x] Add the Traffic tab to the existing Control Tower screen with the Radar icon
- [x] Implement the traffic attribution, aggregation, intent, predictive, and event-type layers
- [x] Build the Traffic tab UI with the node graph, source cards, predictive alerts, and operator controls
- [x] Wire landing and app analytics events into the Traffic intelligence pipeline
- [x] Run the final validation and error sweep

---

## Features

**Traffic Source Intelligence**
- Live tracking of 12+ traffic sources: Instagram, Google Organic, Google Ads, TikTok, Facebook, WhatsApp, Email campaigns, Direct, Referral, Influencer/Campaign links, Unknown, and Dark traffic
- Each source shows: active visitors now, visits over 5m / 1h / 24h, CTA click rate, signup rate, app-open rate, conversion quality score, and affected-user count during incidents
- Full attribution via UTM params, referrer header, custom campaign link IDs, deep link source params, and fingerprinting heuristics to classify "dark traffic" (no referrer, private browsing, etc.)

**World Origin Node Graph**
- Visual node graph showing traffic source bubbles on the left flowing into system modules on the right (Landing → Auth → Database → App → Chat / Invest / Portfolio / Notifications)
- Each source node displays live user count, flow progress indicator, friction score, error/degraded state color, and business outcome score
- Animated connection lines between nodes showing flow volume and direction — thicker lines = more traffic
- Node colors shift based on health: green = healthy, amber = friction detected, red = degraded/blocked

**End-to-End Journey Tracking**
- Full path visualization: traffic source → landing entry → section viewed → CTA click → form start → form submit → API call → Supabase write → auth/signup → app open → first module → deal browse → chat → invest → portfolio/retention
- Live counts at each journey step so you can see where users are concentrated, delayed, or dropping off

**Intent Intelligence (Rule-Based)**
- Infers user intent from source + first actions: browsing deals, investing, joining waitlist, support/help, chat engagement, returning portfolio user, admin/operator access
- Shows top current intent by source, and which sources bring highest-value intent
- Fast, deterministic rules — no heavy AI processing

**Source-to-Outcome Analytics**
- Per-source breakdown: bounce rate, lead conversion, signup conversion, app handoff success, first meaningful action, chat open rate, deal view rate, investment initiation rate, return/retention
- Highlights which traffic sources are highest-value vs lowest-quality

**Friction & Failure Mapping**
- Per-source view of where users are lost: slow landing response, broken CTA, failed form submit, auth failure, app handoff failure, chat degradation, upload failure, invest-flow stall
- Color-coded severity indicators per friction point

**Predictive Source Intelligence (Adaptive)**
- Runs every aggregation cycle during high traffic, every 60 seconds during low traffic
- Predictions like: "Instagram traffic volume rising but CTA quality dropping", "Google traffic has highest investment intent", "TikTok traffic hitting landing but failing at form submit due to API latency"
- Rising low-quality traffic alerts, campaign mismatch detection, source-specific bottleneck warnings

**Operator Control for Traffic Incidents**
- For each source-level incident: impacted users, impacted funnel step, likely cause, safe next action
- Whether to alert owner/admin, throttle, or failover to safer landing path

---

## Design

- **Dark theme** matching existing Nerve Center (background `#050508`, cards `#0D0D12`, borders `#1A1A1F`)
- **Node Graph** at the top of the Traffic tab:
  - Left column: source nodes as rounded rectangles with source icon + name + live count + pulsing orb for active sources
  - Center: animated flowing lines (using Animated opacity pulses) connecting sources to system nodes
  - Right column: system module nodes (Landing, Auth, App, Invest, Chat, etc.) with health-colored borders
  - Each connection line thickness proportional to traffic volume
- **Source Cards** below the graph: expandable cards per traffic source with metrics, intent distribution, outcome breakdown, and friction indicators
- **Journey Funnel Bar** — horizontal step-based funnel bar (similar to existing landing funnel) but grouped by source
- **Predictive Alerts** — amber/red alert chips with trend arrows for rising source risks
- **Quality Score Badges** — circular gauge (like existing Risk Gauge) showing conversion quality per source
- Tab icon: `Radar` from lucide (representing signal detection / origin mapping)

---

## Changes to Existing Screens

**Control Tower screen** — adds one new tab called "Traffic" with the `Radar` icon, positioned after the existing "Funnel" tab

---

## New Files & Modules

**Traffic Attribution Engine** — detects and classifies traffic sources using UTM, referrer, campaign IDs, deep link params, and dark-traffic fingerprinting heuristics

**Traffic Source Aggregator** — aggregates real-time traffic data per source: visitor counts, journey progress, conversion metrics, friction points, and outcome scores

**Intent Classifier** — rule-based engine that maps source + first actions to user intent categories

**Source Predictive Engine** — adaptive prediction system for source-level risk scoring, campaign quality trends, and anomaly detection

**Traffic Event Types** — normalized events: `source_detected`, `source_journey_step`, `source_intent_inferred`, `source_friction_detected`, `source_outcome_recorded`, `source_prediction_raised`

**Traffic Intelligence Tab Component** — the new tab UI with the node graph, source cards, journey funnel, predictions, and operator controls

**Dashboard Snapshot Extension** — extends the existing Control Tower dashboard snapshot to include traffic intelligence data

---

## How It Works

- The landing tracker (already running) captures events with referrer/UTM data
- The new attribution engine classifies each session's source on first event
- The aggregator computes live metrics per source every aggregation cycle
- The intent classifier runs on session start + updates as behavior unfolds
- Predictive scoring runs adaptively — every 10s during high traffic, every 60s during low traffic
- All data flows into the existing Control Tower aggregator and appears in the new Traffic tab
- Source nodes in the graph connect to existing module nodes, creating the world-to-product intelligence graph
