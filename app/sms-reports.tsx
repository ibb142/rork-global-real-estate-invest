import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Animated,
  RefreshControl,
  Platform,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeft,
  MessageSquare,
  Play,
  Square,
  Send,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  Zap,
  BarChart3,
  Phone,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  FileText,
  Users,
  UserCheck,
  Megaphone,
  Brain,
  Sparkles,
  Radio,
} from "lucide-react-native";
import Colors from "@/constants/colors";
import { trpc } from "@/lib/trpc";

type LogType = "all" | "hourly" | "emergency" | "manual" | "daily_summary" | "smart_update";

const TYPE_COLORS: Record<string, string> = {
  hourly: Colors.accent,
  emergency: Colors.error,
  manual: Colors.primary,
  daily_summary: Colors.success,
  smart_update: "#00C9A7",
};

const TYPE_LABELS: Record<string, string> = {
  hourly: "Hourly",
  emergency: "Emergency",
  manual: "Manual",
  daily_summary: "Daily",
  smart_update: "AI Smart",
};

export default function SMSReportsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [logFilter, setLogFilter] = useState<LogType>("all");
  const [logPage, setLogPage] = useState(1);
  const [customMessage, setCustomMessage] = useState("");
  const [emergencySubject, setEmergencySubject] = useState("");
  const [emergencyDetails, setEmergencyDetails] = useState("");
  const [showEmergencyForm, setShowEmergencyForm] = useState(false);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const statusQuery = trpc.smsReports.getStatus.useQuery(undefined, {
    refetchInterval: 30000,
  });

  const logQuery = trpc.smsReports.getLog.useQuery(
    { page: logPage, limit: 15, type: logFilter },
    {}
  );

  const startMutation = trpc.smsReports.startReporting.useMutation({
    onSuccess: () => {
      void statusQuery.refetch();
      void logQuery.refetch();
    },
  });

  const stopMutation = trpc.smsReports.stopReporting.useMutation({
    onSuccess: () => void statusQuery.refetch(),
  });

  const sendNowMutation = trpc.smsReports.sendNow.useMutation({
    onSuccess: () => {
      void logQuery.refetch();
      void statusQuery.refetch();
    },
  });

  const sendDailyMutation = trpc.smsReports.sendDailySummary.useMutation({
    onSuccess: () => {
      void logQuery.refetch();
      void statusQuery.refetch();
    },
  });

  const sendEmergencyMutation = trpc.smsReports.sendEmergency.useMutation({
    onSuccess: () => {
      setEmergencySubject("");
      setEmergencyDetails("");
      setShowEmergencyForm(false);
      void logQuery.refetch();
    },
  });

  const sendCustomMutation = trpc.smsReports.sendCustom.useMutation({
    onSuccess: () => {
      setCustomMessage("");
      setShowCustomForm(false);
      void logQuery.refetch();
    },
  });

  const smartScheduleQuery = trpc.smsReports.getSmartSchedule.useQuery(undefined, {
    refetchInterval: 30000,
  });

  const startSmartMutation = trpc.smsReports.startSmartSchedule.useMutation({
    onSuccess: () => {
      void smartScheduleQuery.refetch();
      void statusQuery.refetch();
      void logQuery.refetch();
    },
  });

  const stopSmartMutation = trpc.smsReports.stopSmartSchedule.useMutation({
    onSuccess: () => {
      void smartScheduleQuery.refetch();
      void statusQuery.refetch();
    },
  });

  const sendSmartNowMutation = trpc.smsReports.sendSmartNow.useMutation({
    onSuccess: () => {
      void logQuery.refetch();
      void smartScheduleQuery.refetch();
      void statusQuery.refetch();
    },
  });

  useEffect(() => {
    if (statusQuery.data?.running) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.4, duration: 1200, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [statusQuery.data?.running, pulseAnim]);

  const onRefresh = useCallback(() => {
    void statusQuery.refetch();
    void logQuery.refetch();
  }, [statusQuery, logQuery]);

  const handleToggleReporting = useCallback(() => {
    if (statusQuery.data?.running) {
      Alert.alert("Stop Reports", "Stop hourly SMS reports?", [
        { text: "Cancel", style: "cancel" },
        { text: "Stop", style: "destructive", onPress: () => stopMutation.mutate() },
      ]);
    } else {
      startMutation.mutate();
    }
  }, [statusQuery.data?.running, startMutation, stopMutation]);

  const handleSendEmergency = useCallback(() => {
    if (!emergencySubject.trim() || !emergencyDetails.trim()) return;
    sendEmergencyMutation.mutate({
      subject: emergencySubject.trim(),
      details: emergencyDetails.trim(),
    });
  }, [emergencySubject, emergencyDetails, sendEmergencyMutation]);

  const handleSendCustom = useCallback(() => {
    if (!customMessage.trim()) return;
    sendCustomMutation.mutate({ message: customMessage.trim() });
  }, [customMessage, sendCustomMutation]);

  const status = statusQuery.data;
  const logs = logQuery.data;
  const isRunning = status?.running ?? false;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="sms-back">
          <ArrowLeft size={22} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <MessageSquare size={20} color={Colors.primary} />
          <Text style={styles.headerTitle}>SMS Command Center</Text>
        </View>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn} testID="sms-refresh">
          <RefreshCw size={18} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={statusQuery.isRefetching}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
      >
        <View style={styles.smartCard}>
          <View style={styles.smartHeader}>
            <View style={styles.smartHeaderLeft}>
              <Brain size={20} color="#00C9A7" />
              <Text style={styles.smartTitle}>AI Smart Messaging</Text>
            </View>
            <View style={[
              styles.smartModeBadge,
              {
                backgroundColor: smartScheduleQuery.data?.running ? "#00C9A720" : Colors.surface,
                borderColor: smartScheduleQuery.data?.running ? "#00C9A760" : Colors.surfaceBorder,
              },
            ]}>
              <Animated.View style={[
                styles.smartModeDot,
                {
                  backgroundColor: smartScheduleQuery.data?.running ? "#00C9A7" : Colors.textTertiary,
                  opacity: smartScheduleQuery.data?.running ? pulseAnim : 1,
                },
              ]} />
              <Text style={[
                styles.smartModeText,
                { color: smartScheduleQuery.data?.running ? "#00C9A7" : Colors.textTertiary },
              ]}>
                {smartScheduleQuery.data?.running ? smartScheduleQuery.data.mode === "testing" ? "TESTING" : "LIVE 24/7" : "OFF"}
              </Text>
            </View>
          </View>

          <Text style={styles.smartDesc}>
            AI sends personalized, professional updates to Kimberly & Sharon — addressed by name, concise, and context-aware.
          </Text>

          <View style={styles.smartScheduleInfo}>
            <View style={styles.smartInfoRow}>
              <Clock size={13} color={Colors.textSecondary} />
              <Text style={styles.smartInfoText}>
                {smartScheduleQuery.data?.timesPerDay || 3}x/day at{" "}
                {(smartScheduleQuery.data?.scheduledHoursET || [8, 13, 18]).map(h => `${h}:00`).join(", ")} ET
              </Text>
            </View>
            <View style={styles.smartInfoRow}>
              <Users size={13} color={Colors.textSecondary} />
              <Text style={styles.smartInfoText}>
                {(smartScheduleQuery.data?.recipients || ["Kimberly Perez", "Sharon"]).join(", ")}
              </Text>
            </View>
            {smartScheduleQuery.data?.startDate && (
              <View style={styles.smartInfoRow}>
                <Sparkles size={13} color={Colors.textSecondary} />
                <Text style={styles.smartInfoText}>
                  Start: {smartScheduleQuery.data.startDate}
                </Text>
              </View>
            )}
          </View>

          {smartScheduleQuery.data?.recentMessages && smartScheduleQuery.data.recentMessages.length > 0 && (
            <View style={styles.smartRecentSection}>
              <Text style={styles.smartRecentTitle}>Recent AI Messages</Text>
              {smartScheduleQuery.data.recentMessages.slice(-3).map((msg, idx) => (
                <View key={idx} style={styles.smartRecentItem}>
                  <View style={styles.smartRecentHeader}>
                    <Text style={styles.smartRecentRecipient}>{msg.recipient}</Text>
                    <Text style={styles.smartRecentTime}>
                      {new Date(msg.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                    </Text>
                  </View>
                  <Text style={styles.smartRecentMsg} numberOfLines={2}>{msg.message}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.smartActions}>
            {!smartScheduleQuery.data?.running ? (
              <TouchableOpacity
                style={styles.smartStartBtn}
                onPress={() => startSmartMutation.mutate({
                  mode: "testing",
                  timesPerDay: 3,
                  scheduledHoursET: [8, 13, 18],
                })}
                disabled={startSmartMutation.isPending}
                testID="smart-start"
              >
                {startSmartMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Brain size={16} color="#FFF" />
                    <Text style={styles.smartStartText}>Activate AI Schedule</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <View style={styles.smartRunningActions}>
                <TouchableOpacity
                  style={styles.smartSendNowBtn}
                  onPress={() => sendSmartNowMutation.mutate()}
                  disabled={sendSmartNowMutation.isPending}
                  testID="smart-send-now"
                >
                  {sendSmartNowMutation.isPending ? (
                    <ActivityIndicator size="small" color="#00C9A7" />
                  ) : (
                    <>
                      <Radio size={14} color="#00C9A7" />
                      <Text style={styles.smartSendNowText}>Send AI Update Now</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.smartStopBtn}
                  onPress={() => {
                    Alert.alert("Stop AI Schedule", "Stop automated AI messaging to the team?", [
                      { text: "Cancel", style: "cancel" },
                      { text: "Stop", style: "destructive", onPress: () => stopSmartMutation.mutate() },
                    ]);
                  }}
                  disabled={stopSmartMutation.isPending}
                  testID="smart-stop"
                >
                  <Square size={14} color={Colors.error} />
                  <Text style={styles.smartStopText}>Stop</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        <View style={styles.teamCard}>
          <View style={styles.teamHeader}>
            <Users size={18} color={Colors.accent} />
            <Text style={styles.teamTitle}>Advertising Team</Text>
            <View style={styles.teamBadge}>
              <Text style={styles.teamBadgeText}>
                {status?.recipients?.filter((r: any) => r.active).length ?? 0} Active
              </Text>
            </View>
          </View>
          {status?.recipients?.map((r: any, idx: number) => {
            const isManager = r.role === "advertising_manager";
            const isOwner = r.role === "owner";
            const roleColor = isOwner ? Colors.primary : isManager ? Colors.accent : Colors.success;
            const roleLabel = isOwner ? "CEO / Owner" : isManager ? "Ad Manager" : "Ad Partner";
            const roleIcon = isOwner ? Zap : isManager ? Megaphone : UserCheck;
            const RoleIcon = roleIcon;
            return (
              <View key={idx} style={styles.teamMember}>
                <View style={[styles.teamAvatar, { borderColor: roleColor + "60" }]}>
                  <RoleIcon size={16} color={roleColor} />
                </View>
                <View style={styles.teamInfo}>
                  <View style={styles.teamNameRow}>
                    <Text style={styles.teamName}>{r.name}</Text>
                    <View style={[styles.teamRoleBadge, { backgroundColor: roleColor + "18", borderColor: roleColor + "40" }]}>
                      <Text style={[styles.teamRoleText, { color: roleColor }]}>{roleLabel}</Text>
                    </View>
                  </View>
                  <View style={styles.teamPhoneRow}>
                    <Phone size={11} color={Colors.textTertiary} />
                    <Text style={styles.teamPhone}>{r.phone}</Text>
                  </View>
                  <View style={styles.teamAlertRow}>
                    {r.alertTypes.map((t: string) => (
                      <View key={t} style={[styles.alertTypeDot, { backgroundColor: (TYPE_COLORS[t] || Colors.textTertiary) + "30" }]}>
                        <Text style={[styles.alertTypeDotText, { color: TYPE_COLORS[t] || Colors.textTertiary }]}>
                          {TYPE_LABELS[t] || t}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
                <View style={[styles.teamStatusDot, { backgroundColor: r.active ? Colors.success : Colors.textTertiary }]} />
              </View>
            );
          })}
          <View style={styles.teamFooter}>
            <Text style={styles.teamFooterText}>All team members receive alerts 24/7 for potential investors, owners, JV partners, brokers & influencers</Text>
          </View>
        </View>

        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <View style={styles.statusLeft}>
              <Animated.View style={[styles.statusDot, { backgroundColor: isRunning ? Colors.success : Colors.textTertiary, opacity: isRunning ? pulseAnim : 1 }]} />
              <View>
                <Text style={styles.statusLabel}>{isRunning ? "LIVE REPORTING" : "INACTIVE"}</Text>
                <Text style={styles.statusPhone}>
                  <Phone size={12} color={Colors.textSecondary} /> {status?.phone || "+1 561-644-3503"}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.toggleBtn, isRunning ? styles.toggleBtnStop : styles.toggleBtnStart]}
              onPress={handleToggleReporting}
              testID="sms-toggle"
            >
              {isRunning ? (
                <>
                  <Square size={14} color={Colors.error} />
                  <Text style={[styles.toggleText, { color: Colors.error }]}>Stop</Text>
                </>
              ) : (
                <>
                  <Play size={14} color={Colors.success} />
                  <Text style={[styles.toggleText, { color: Colors.success }]}>Start</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{status?.totalSent ?? 0}</Text>
              <Text style={styles.statLabel}>Sent</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: status?.totalFailed ? Colors.error : Colors.text }]}>{status?.totalFailed ?? 0}</Text>
              <Text style={styles.statLabel}>Failed</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {status?.lastReportTime
                  ? new Date(status.lastReportTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
                  : "—"}
              </Text>
              <Text style={styles.statLabel}>Last Sent</Text>
            </View>
          </View>
        </View>

        <View style={styles.actionsGrid}>
          <TouchableOpacity
            style={[styles.actionCard, { borderColor: Colors.accent + "40" }]}
            onPress={() => sendNowMutation.mutate()}
            disabled={sendNowMutation.isPending}
            testID="sms-send-now"
          >
            {sendNowMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.accent} />
            ) : (
              <BarChart3 size={22} color={Colors.accent} />
            )}
            <Text style={styles.actionLabel}>Send Report Now</Text>
            <Text style={styles.actionDesc}>Hourly snapshot</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCard, { borderColor: Colors.success + "40" }]}
            onPress={() => sendDailyMutation.mutate()}
            disabled={sendDailyMutation.isPending}
            testID="sms-send-daily"
          >
            {sendDailyMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.success} />
            ) : (
              <FileText size={22} color={Colors.success} />
            )}
            <Text style={styles.actionLabel}>Daily Summary</Text>
            <Text style={styles.actionDesc}>Full day recap</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCard, { borderColor: Colors.error + "40" }]}
            onPress={() => setShowEmergencyForm(!showEmergencyForm)}
            testID="sms-emergency"
          >
            <AlertTriangle size={22} color={Colors.error} />
            <Text style={styles.actionLabel}>Emergency</Text>
            <Text style={styles.actionDesc}>Priority alert</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCard, { borderColor: Colors.primary + "40" }]}
            onPress={() => setShowCustomForm(!showCustomForm)}
            testID="sms-custom"
          >
            <Send size={22} color={Colors.primary} />
            <Text style={styles.actionLabel}>Custom SMS</Text>
            <Text style={styles.actionDesc}>Free text</Text>
          </TouchableOpacity>
        </View>

        {showEmergencyForm && (
          <View style={styles.formCard}>
            <View style={styles.formHeader}>
              <AlertTriangle size={16} color={Colors.error} />
              <Text style={[styles.formTitle, { color: Colors.error }]}>Emergency Alert</Text>
            </View>
            <TextInput
              style={styles.input}
              placeholder="Subject (e.g., Server Down)"
              placeholderTextColor={Colors.inputPlaceholder}
              value={emergencySubject}
              onChangeText={setEmergencySubject}
              maxLength={100}
              testID="emergency-subject"
            />
            <TextInput
              style={[styles.input, styles.multilineInput]}
              placeholder="Details..."
              placeholderTextColor={Colors.inputPlaceholder}
              value={emergencyDetails}
              onChangeText={setEmergencyDetails}
              multiline
              maxLength={500}
              testID="emergency-details"
            />
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: Colors.error }]}
              onPress={handleSendEmergency}
              disabled={sendEmergencyMutation.isPending || !emergencySubject.trim() || !emergencyDetails.trim()}
            >
              {sendEmergencyMutation.isPending ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Zap size={16} color="#FFF" />
                  <Text style={styles.sendBtnText}>Send Emergency Alert</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {showCustomForm && (
          <View style={styles.formCard}>
            <View style={styles.formHeader}>
              <Send size={16} color={Colors.primary} />
              <Text style={[styles.formTitle, { color: Colors.primary }]}>Custom Message</Text>
            </View>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              placeholder="Type your message..."
              placeholderTextColor={Colors.inputPlaceholder}
              value={customMessage}
              onChangeText={setCustomMessage}
              multiline
              maxLength={1600}
              testID="custom-message"
            />
            <Text style={styles.charCount}>{customMessage.length}/1600</Text>
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: Colors.primary }]}
              onPress={handleSendCustom}
              disabled={sendCustomMutation.isPending || !customMessage.trim()}
            >
              {sendCustomMutation.isPending ? (
                <ActivityIndicator size="small" color={Colors.black} />
              ) : (
                <>
                  <Send size={16} color={Colors.black} />
                  <Text style={[styles.sendBtnText, { color: Colors.black }]}>Send SMS</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {status?.lastReport ? (
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>Last Report Preview</Text>
            <View style={styles.previewBox}>
              <Text style={styles.previewText}>{status.lastReport}</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.logSection}>
          <Text style={styles.sectionTitle}>Message History</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
            {(["all", "hourly", "emergency", "manual", "daily_summary", "smart_update"] as LogType[]).map((type) => (
              <TouchableOpacity
                key={type}
                style={[styles.filterChip, logFilter === type && styles.filterChipActive]}
                onPress={() => { setLogFilter(type); setLogPage(1); }}
              >
                <Text style={[styles.filterText, logFilter === type && styles.filterTextActive]}>
                  {type === "all" ? "All" : TYPE_LABELS[type] || type}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {logQuery.isLoading ? (
            <ActivityIndicator size="small" color={Colors.primary} style={{ marginTop: 20 }} />
          ) : logs?.items.length === 0 ? (
            <View style={styles.emptyLog}>
              <MessageSquare size={32} color={Colors.textTertiary} />
              <Text style={styles.emptyText}>No messages yet</Text>
              <Text style={styles.emptySubtext}>Start reporting to see SMS history</Text>
            </View>
          ) : (
            <>
              {logs?.items.map((entry) => {
                const isExpanded = expandedLog === entry.id;
                const typeColor = TYPE_COLORS[entry.type] || Colors.textSecondary;
                return (
                  <TouchableOpacity
                    key={entry.id}
                    style={styles.logItem}
                    onPress={() => setExpandedLog(isExpanded ? null : entry.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.logItemHeader}>
                      <View style={[styles.logTypeBadge, { backgroundColor: typeColor + "20", borderColor: typeColor + "40" }]}>
                        <Text style={[styles.logTypeText, { color: typeColor }]}>
                          {TYPE_LABELS[entry.type] || entry.type}
                        </Text>
                      </View>
                      <View style={styles.logStatusRow}>
                        {entry.status === "sent" ? (
                          <CheckCircle size={14} color={Colors.success} />
                        ) : entry.status === "simulated" ? (
                          <Clock size={14} color={Colors.warning} />
                        ) : (
                          <XCircle size={14} color={Colors.error} />
                        )}
                        <Text style={styles.logTime}>
                          {new Date(entry.sentAt).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </Text>
                        {isExpanded ? (
                          <ChevronUp size={14} color={Colors.textTertiary} />
                        ) : (
                          <ChevronDown size={14} color={Colors.textTertiary} />
                        )}
                      </View>
                    </View>
                    <Text style={styles.logPreview} numberOfLines={isExpanded ? undefined : 2}>
                      {entry.message}
                    </Text>
                    {entry.error && (
                      <Text style={styles.logError}>{entry.error}</Text>
                    )}
                  </TouchableOpacity>
                );
              })}

              {logs && logs.totalPages > 1 && (
                <View style={styles.pagination}>
                  <TouchableOpacity
                    style={[styles.pageBtn, logPage <= 1 && styles.pageBtnDisabled]}
                    onPress={() => setLogPage(p => Math.max(1, p - 1))}
                    disabled={logPage <= 1}
                  >
                    <Text style={styles.pageBtnText}>Prev</Text>
                  </TouchableOpacity>
                  <Text style={styles.pageInfo}>{logPage} / {logs.totalPages}</Text>
                  <TouchableOpacity
                    style={[styles.pageBtn, logPage >= logs.totalPages && styles.pageBtnDisabled]}
                    onPress={() => setLogPage(p => Math.min(logs.totalPages, p + 1))}
                    disabled={logPage >= logs.totalPages}
                  >
                    <Text style={styles.pageBtnText}>Next</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>How It Works</Text>
          <View style={styles.infoRow}>
            <Clock size={14} color={Colors.accent} />
            <Text style={styles.infoText}>Hourly reports with traffic, transactions, and KPIs</Text>
          </View>
          <View style={styles.infoRow}>
            <AlertTriangle size={14} color={Colors.error} />
            <Text style={styles.infoText}>Emergency alerts for errors, memory spikes, and outages</Text>
          </View>
          <View style={styles.infoRow}>
            <FileText size={14} color={Colors.success} />
            <Text style={styles.infoText}>Daily summaries at midnight ET with full recap</Text>
          </View>
          <View style={styles.infoRow}>
            <Zap size={14} color={Colors.primary} />
            <Text style={styles.infoText}>Powered by AWS SNS — works while you sleep</Text>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  headerCenter: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700" as const,
    color: Colors.text,
    letterSpacing: -0.3,
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  statusCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  statusRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    marginBottom: 16,
  },
  statusLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: Colors.text,
    letterSpacing: 1,
  },
  statusPhone: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  toggleBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  toggleBtnStart: {
    borderColor: Colors.success + "60",
    backgroundColor: Colors.success + "15",
  },
  toggleBtnStop: {
    borderColor: Colors.error + "60",
    backgroundColor: Colors.error + "15",
  },
  toggleText: {
    fontSize: 13,
    fontWeight: "600" as const,
  },
  statsRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-around" as const,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
  },
  statItem: {
    alignItems: "center" as const,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: Colors.text,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: Colors.surfaceBorder,
  },
  actionsGrid: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 10,
  },
  actionCard: {
    width: "48%" as any,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    alignItems: "center" as const,
    gap: 8,
    flexGrow: 1,
    flexBasis: "45%" as any,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: Colors.text,
  },
  actionDesc: {
    fontSize: 11,
    color: Colors.textTertiary,
  },
  formCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 10,
  },
  formHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    marginBottom: 4,
  },
  formTitle: {
    fontSize: 14,
    fontWeight: "700" as const,
  },
  input: {
    backgroundColor: Colors.inputBackground,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: Colors.text,
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: "top" as const,
  },
  charCount: {
    fontSize: 11,
    color: Colors.textTertiary,
    textAlign: "right" as const,
  },
  sendBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  sendBtnText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#FFF",
  },
  previewCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  previewTitle: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: Colors.textSecondary,
    marginBottom: 10,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  previewBox: {
    backgroundColor: Colors.backgroundTertiary,
    borderRadius: 10,
    padding: 14,
  },
  previewText: {
    fontSize: 12,
    color: Colors.text,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    lineHeight: 18,
  },
  logSection: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: Colors.text,
  },
  filterRow: {
    flexDirection: "row" as const,
    marginBottom: 4,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    marginRight: 8,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  filterChipActive: {
    backgroundColor: Colors.primary + "20",
    borderColor: Colors.primary + "60",
  },
  filterText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: "500" as const,
  },
  filterTextActive: {
    color: Colors.primary,
    fontWeight: "600" as const,
  },
  emptyLog: {
    alignItems: "center" as const,
    paddingVertical: 32,
    gap: 8,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: Colors.textSecondary,
  },
  emptySubtext: {
    fontSize: 12,
    color: Colors.textTertiary,
  },
  logItem: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 8,
  },
  logItemHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
  },
  logTypeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  logTypeText: {
    fontSize: 11,
    fontWeight: "600" as const,
  },
  logStatusRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
  },
  logTime: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  logPreview: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  logError: {
    fontSize: 11,
    color: Colors.error,
    fontStyle: "italic" as const,
  },
  pagination: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 16,
    paddingVertical: 8,
  },
  pageBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  pageBtnDisabled: {
    opacity: 0.4,
  },
  pageBtnText: {
    fontSize: 12,
    color: Colors.text,
    fontWeight: "500" as const,
  },
  pageInfo: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  infoCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 10,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: Colors.text,
    marginBottom: 4,
  },
  infoRow: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 10,
  },
  infoText: {
    fontSize: 12,
    color: Colors.textSecondary,
    flex: 1,
    lineHeight: 17,
  },
  teamCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.accent + "30",
    gap: 14,
  },
  teamHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  teamTitle: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: Colors.text,
    flex: 1,
  },
  teamBadge: {
    backgroundColor: Colors.success + "18",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.success + "40",
  },
  teamBadgeText: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: Colors.success,
  },
  teamMember: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    backgroundColor: Colors.backgroundTertiary,
    borderRadius: 12,
    padding: 12,
  },
  teamAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderWidth: 2,
  },
  teamInfo: {
    flex: 1,
    gap: 3,
  },
  teamNameRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  teamName: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: Colors.text,
  },
  teamRoleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  teamRoleText: {
    fontSize: 10,
    fontWeight: "600" as const,
  },
  teamPhoneRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
  },
  teamPhone: {
    fontSize: 12,
    color: Colors.textTertiary,
  },
  teamAlertRow: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 4,
    marginTop: 2,
  },
  alertTypeDot: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  alertTypeDotText: {
    fontSize: 9,
    fontWeight: "600" as const,
  },
  teamStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  teamFooter: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
  },
  teamFooterText: {
    fontSize: 11,
    color: Colors.textTertiary,
    lineHeight: 16,
    textAlign: "center" as const,
  },
  smartCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: "#00C9A730",
    gap: 14,
  },
  smartHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
  },
  smartHeaderLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  smartTitle: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: Colors.text,
  },
  smartModeBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  smartModeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  smartModeText: {
    fontSize: 10,
    fontWeight: "700" as const,
    letterSpacing: 0.5,
  },
  smartDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
  },
  smartScheduleInfo: {
    gap: 6,
    backgroundColor: Colors.backgroundTertiary,
    borderRadius: 10,
    padding: 12,
  },
  smartInfoRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  smartInfoText: {
    fontSize: 12,
    color: Colors.textSecondary,
    flex: 1,
  },
  smartRecentSection: {
    gap: 8,
  },
  smartRecentTitle: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: Colors.textSecondary,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  smartRecentItem: {
    backgroundColor: Colors.backgroundTertiary,
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  smartRecentHeader: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
  },
  smartRecentRecipient: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: "#00C9A7",
  },
  smartRecentTime: {
    fontSize: 10,
    color: Colors.textTertiary,
  },
  smartRecentMsg: {
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  smartActions: {
    gap: 8,
  },
  smartStartBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    backgroundColor: "#00C9A7",
    paddingVertical: 12,
    borderRadius: 12,
  },
  smartStartText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#FFF",
  },
  smartRunningActions: {
    flexDirection: "row" as const,
    gap: 8,
  },
  smartSendNowBtn: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#00C9A760",
    backgroundColor: "#00C9A715",
  },
  smartSendNowText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: "#00C9A7",
  },
  smartStopBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.error + "60",
    backgroundColor: Colors.error + "15",
  },
  smartStopText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: Colors.error,
  },
});
