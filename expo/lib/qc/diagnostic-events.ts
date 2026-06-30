import { Platform } from 'react-native';
import type { QCDiagnosticEvent, QCFlowId, QCModuleId, QCSeverity, QCHealAction } from './types';

let eventCounter = 0;

function generateEventId(): string {
  eventCounter++;
  return `qc_evt_${Date.now()}_${eventCounter}_${Math.random().toString(36).slice(2, 6)}`;
}

function generateCorrelationId(): string {
  return `qc_cor_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const MAX_EVENT_BUFFER = 200;
const eventBuffer: QCDiagnosticEvent[] = [];

export function createDiagnosticEvent(params: {
  flow: QCFlowId;
  module: QCModuleId;
  severity: QCSeverity;
  title: string;
  summary: string;
  failingStep: string;
  likelyFile?: string;
  correlationId?: string;
  metadata?: Record<string, string | number | boolean>;
  autoHealEligible?: boolean;
  suggestedHealAction?: QCHealAction;
}): QCDiagnosticEvent {
  const event: QCDiagnosticEvent = {
    id: generateEventId(),
    correlationId: params.correlationId ?? generateCorrelationId(),
    timestamp: new Date().toISOString(),
    flow: params.flow,
    module: params.module,
    severity: params.severity,
    title: params.title,
    summary: params.summary,
    failingStep: params.failingStep,
    likelyFile: params.likelyFile,
    environment: `${Platform.OS}/${__DEV__ ? 'dev' : 'prod'}`,
    metadata: params.metadata,
    autoHealEligible: params.autoHealEligible ?? false,
    suggestedHealAction: params.suggestedHealAction,
  };

  eventBuffer.push(event);
  if (eventBuffer.length > MAX_EVENT_BUFFER) {
    eventBuffer.splice(0, eventBuffer.length - MAX_EVENT_BUFFER);
  }

  console.log(`[QC:Diagnostic] ${event.severity.toUpperCase()} | ${event.flow} | ${event.title} | ${event.summary}`);
  return event;
}

export function getRecentDiagnosticEvents(limit: number = 50): QCDiagnosticEvent[] {
  return eventBuffer.slice(-limit);
}

export function getDiagnosticEventsByFlow(flow: QCFlowId, limit: number = 20): QCDiagnosticEvent[] {
  return eventBuffer.filter((e) => e.flow === flow).slice(-limit);
}

export function getDiagnosticEventsBySeverity(severity: QCSeverity, limit: number = 20): QCDiagnosticEvent[] {
  return eventBuffer.filter((e) => e.severity === severity).slice(-limit);
}

export function clearDiagnosticEvents(): void {
  eventBuffer.length = 0;
  console.log('[QC:Diagnostic] Event buffer cleared');
}

export { generateCorrelationId };
