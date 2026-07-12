/**
 * IVX E2E Pipeline Plan
 *
 * Owner-visible plan + dry-run runner for the end-to-end acceptance
 * pipeline. The plan is code-only (no Maestro / Playwright deps yet);
 * `runE2EDryRun` exercises the suite list and the structured test
 * reporter so the panel can display real evidence today.
 */
import { runStructuredTestReport, type TestReport } from './ivx-test-reporter';

export const IVX_E2E_PIPELINE_MARKER = 'ivx-e2e-pipeline-2026-05-28';

export type E2EStep = {
  id: string;
  title: string;
  surface: 'backend' | 'frontend' | 'integration';
  status: 'planned' | 'dry_run_pass' | 'dry_run_fail' | 'waiting_external_setup';
  detail: string;
};

export type E2EPlan = {
  marker: string;
  generatedAt: string;
  steps: E2EStep[];
  reports?: TestReport[];
};

const STATIC_PLAN: E2EStep[] = [
  { id: 'typecheck', title: 'TypeScript typecheck (expo + backend)', surface: 'backend', status: 'planned', detail: 'Runs senior-dev test_run suite=typecheck.' },
  { id: 'lint', title: 'Lint (eslint expo)', surface: 'frontend', status: 'planned', detail: 'Runs senior-dev test_run suite=lint.' },
  { id: 'smoke', title: 'Backend smoke (health + owner-ai proxy-status)', surface: 'backend', status: 'planned', detail: 'Runs senior-dev test_run suite=smoke.' },
  { id: 'owner_login_flow', title: 'Owner login flow (Maestro)', surface: 'integration', status: 'waiting_external_setup', detail: 'Maestro runner not installed in environment; flow specified in expo/__tests__/.' },
  { id: 'ivx_chat_send', title: 'IVX Owner AI chat send + assistant reply', surface: 'integration', status: 'waiting_external_setup', detail: 'Needs E2E runner with cloud simulator.' },
];

export function getE2EPlan(): E2EPlan {
  return {
    marker: IVX_E2E_PIPELINE_MARKER,
    generatedAt: new Date().toISOString(),
    steps: STATIC_PLAN.slice(),
  };
}

export async function runE2EDryRun(): Promise<E2EPlan> {
  const reports: TestReport[] = [];
  const steps: E2EStep[] = [];
  for (const step of STATIC_PLAN) {
    if (step.id === 'typecheck' || step.id === 'lint' || step.id === 'smoke') {
      const report = await runStructuredTestReport(step.id as 'typecheck' | 'lint' | 'smoke');
      reports.push(report);
      steps.push({
        ...step,
        status: report.ok ? 'dry_run_pass' : 'dry_run_fail',
        detail: `${step.detail} exit=${report.exitCode ?? 'n/a'} dur=${report.durationMs}ms`,
      });
    } else {
      steps.push(step);
    }
  }
  return {
    marker: IVX_E2E_PIPELINE_MARKER,
    generatedAt: new Date().toISOString(),
    steps,
    reports,
  };
}
