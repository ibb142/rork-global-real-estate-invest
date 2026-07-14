import React from 'react';
import { Stack } from 'expo-router';
import Colors from '@/constants/colors';

// IVX Crash Shield: route-level error boundary for every ivx screen
// (chat / cto-dashboard / diagnostics / incidents / deploy / etc.).
export { ErrorBoundary } from 'expo-router';

const IVX_STACK_SCREEN_OPTIONS = {
  headerStyle: { backgroundColor: Colors.background },
  headerTintColor: Colors.text,
  headerTitleStyle: { fontWeight: '700' as const },
  contentStyle: { backgroundColor: Colors.background },
  headerShadowVisible: false,
} as const;

const IVX_INBOX_OPTIONS = { title: 'IVX Inbox' } as const;
const IVX_CHAT_OPTIONS = { title: 'IVX Owner AI', headerShown: false } as const;
const IVX_VARIABLES_OPTIONS = { title: 'Variables / Credentials' } as const;
const IVX_INDEPENDENCE_OPTIONS = { title: 'Independence Tracker' } as const;
const IVX_FILES_OPTIONS = { title: 'Files & Multimodal' } as const;
const IVX_DIAGNOSTICS_OPTIONS = { title: 'IVX Diagnostics' } as const;
const IVX_PRODUCTION_DIAGNOSTICS_OPTIONS = { title: 'Production Diagnostics' } as const;
const IVX_OWNER_AI_LOG_OPTIONS = { title: 'Owner AI Diagnostics Log' } as const;
const IVX_SEARCH_OPTIONS = { title: 'Search Owner Room' } as const;
const IVX_CTO_DASHBOARD_OPTIONS = { title: 'CTO Operational Dashboard' } as const;
const IVX_PROJECT_DASHBOARD_OPTIONS = { title: 'AI Project Dashboard' } as const;
const IVX_PROOF_TEST_OPTIONS = { title: 'Proof Test' } as const;
const IVX_DURABILITY_PROOF_OPTIONS = { title: 'Owner AI Durability Proof' } as const;
const IVX_PROOF_LEDGER_OPTIONS = { title: 'Senior Developer Proof Ledger' } as const;
const IVX_INCIDENTS_OPTIONS = { title: 'Incidents' } as const;
const IVX_DEPLOY_OPTIONS = { title: 'Approve & Deploy' } as const;
const IVX_CONTACT_OPTIONS = { title: 'Contact Profile' } as const;
const IVX_AUTONOMOUS_SCALE_OPTIONS = { title: 'Autonomous Scale Mode' } as const;
const IVX_AUTONOMOUS_ACTIVITY_OPTIONS = { title: 'Autonomous Activity (24h)' } as const;
const IVX_MASTER_LEAD_LIST_OPTIONS = { title: 'Master Lead List' } as const;
const IVX_LEAD_AUDIT_LOG_OPTIONS = { title: 'Lead Audit Log' } as const;
const IVX_DAILY_REPORT_OPTIONS = { title: 'Daily Report' } as const;
const IVX_GITHUB_SYNC_OPTIONS = { title: 'Sync to GitHub' } as const;
const IVX_CAMPAIGN_OPTIONS = { title: 'Campaign Report' } as const;
const IVX_AUTONOMOUS_OPS_OPTIONS = { title: 'Autonomous Operations' } as const;
const IVX_AGENT_COMMAND_CENTER_OPTIONS = { title: 'AI Engineering Command Center' } as const;
const IVX_VERCEL_EXIT_OPTIONS = { title: 'Vercel Exit Command Center' } as const;

export default function IVXOwnerLayout() {
  return (
    <Stack screenOptions={IVX_STACK_SCREEN_OPTIONS}>
      <Stack.Screen name="inbox" options={IVX_INBOX_OPTIONS} />
      <Stack.Screen name="chat" options={IVX_CHAT_OPTIONS} />
      <Stack.Screen name="variables" options={IVX_VARIABLES_OPTIONS} />
      <Stack.Screen name="independence" options={IVX_INDEPENDENCE_OPTIONS} />
      <Stack.Screen name="files" options={IVX_FILES_OPTIONS} />
      <Stack.Screen name="diagnostics" options={IVX_DIAGNOSTICS_OPTIONS} />
      <Stack.Screen name="production-diagnostics" options={IVX_PRODUCTION_DIAGNOSTICS_OPTIONS} />
      <Stack.Screen name="owner-ai-log" options={IVX_OWNER_AI_LOG_OPTIONS} />
      <Stack.Screen name="search" options={IVX_SEARCH_OPTIONS} />
      <Stack.Screen name="cto-dashboard" options={IVX_CTO_DASHBOARD_OPTIONS} />
      <Stack.Screen name="project-dashboard" options={IVX_PROJECT_DASHBOARD_OPTIONS} />
      <Stack.Screen name="proof-test" options={IVX_PROOF_TEST_OPTIONS} />
      <Stack.Screen name="durability-proof" options={IVX_DURABILITY_PROOF_OPTIONS} />
      <Stack.Screen name="proof-ledger" options={IVX_PROOF_LEDGER_OPTIONS} />
      <Stack.Screen name="incidents" options={IVX_INCIDENTS_OPTIONS} />
      <Stack.Screen name="deploy" options={IVX_DEPLOY_OPTIONS} />
      <Stack.Screen name="contact/[id]" options={IVX_CONTACT_OPTIONS} />
      <Stack.Screen name="autonomous-scale" options={IVX_AUTONOMOUS_SCALE_OPTIONS} />
      <Stack.Screen name="autonomous-activity" options={IVX_AUTONOMOUS_ACTIVITY_OPTIONS} />
      <Stack.Screen name="master-lead-list" options={IVX_MASTER_LEAD_LIST_OPTIONS} />
      <Stack.Screen name="lead-audit-log" options={IVX_LEAD_AUDIT_LOG_OPTIONS} />
      <Stack.Screen name="daily-report" options={IVX_DAILY_REPORT_OPTIONS} />
      <Stack.Screen name="github-sync" options={IVX_GITHUB_SYNC_OPTIONS} />
      <Stack.Screen name="campaign" options={IVX_CAMPAIGN_OPTIONS} />
      <Stack.Screen name="autonomous-ops" options={IVX_AUTONOMOUS_OPS_OPTIONS} />
      <Stack.Screen name="agent-command-center" options={IVX_AGENT_COMMAND_CENTER_OPTIONS} />
      <Stack.Screen name="vercel-exit" options={IVX_VERCEL_EXIT_OPTIONS} />
    </Stack>
  );
}
