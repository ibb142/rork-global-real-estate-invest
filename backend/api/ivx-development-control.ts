import { assertIVXOwnerOnly, ownerOnlyJson, ownerOnlyOptions } from './owner-only';

const DEPLOYMENT_MARKER = 'ivx-development-control-2026-04-27';

type IVXDevelopmentControlCapability = {
  id: string;
  status: 'available' | 'confirmation_required' | 'external_blocked';
  owner: 'IVX';
  scope: 'repo-local' | 'backend' | 'deploy' | 'public-deploy';
};

type IVXDevelopmentActionType = 'inspect' | 'patch' | 'validate' | 'build' | 'supabase_read' | 'deploy' | 'public_deploy';

type IVXDevelopmentActionRequest = {
  action?: unknown;
  target?: unknown;
  confirm?: unknown;
  confirmText?: unknown;
};

const ACTION_CONFIRMATION_TEXT: Record<Extract<IVXDevelopmentActionType, 'deploy' | 'public_deploy'>, string> = {
  deploy: 'CONFIRM_IVX_DEPLOY_ACTION',
  public_deploy: 'CONFIRM_IVX_PUBLIC_DEPLOY',
};

const CAPABILITIES: IVXDevelopmentControlCapability[] = [
  { id: 'inspect_repo', status: 'available', owner: 'IVX', scope: 'repo-local' },
  { id: 'patch_repo_files', status: 'available', owner: 'IVX', scope: 'repo-local' },
  { id: 'run_validation', status: 'available', owner: 'IVX', scope: 'repo-local' },
  { id: 'build_expo_exports', status: 'available', owner: 'IVX', scope: 'repo-local' },
  { id: 'supabase_read_tools', status: 'available', owner: 'IVX', scope: 'backend' },
  { id: 'supabase_write_tools', status: 'confirmation_required', owner: 'IVX', scope: 'backend' },
  { id: 'deploy_scripts', status: 'confirmation_required', owner: 'IVX', scope: 'deploy' },
  { id: 'public_production_deploy', status: 'confirmation_required', owner: 'IVX', scope: 'public-deploy' },
];

export function ivxDevelopmentControlOptions(): Response {
  return ownerOnlyOptions();
}

function normalizeAction(value: unknown): IVXDevelopmentActionType | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized === 'inspect' || normalized === 'patch' || normalized === 'validate' || normalized === 'build' || normalized === 'supabase_read' || normalized === 'deploy' || normalized === 'public_deploy') {
    return normalized;
  }

  return null;
}

function isConfirmedAction(action: IVXDevelopmentActionType, request: IVXDevelopmentActionRequest): boolean {
  if (action !== 'deploy' && action !== 'public_deploy') {
    return true;
  }

  return request.confirm === true && request.confirmText === ACTION_CONFIRMATION_TEXT[action];
}

function getActionScope(action: IVXDevelopmentActionType): IVXDevelopmentControlCapability['scope'] {
  if (action === 'supabase_read') {
    return 'backend';
  }
  if (action === 'deploy') {
    return 'deploy';
  }
  if (action === 'public_deploy') {
    return 'public-deploy';
  }
  return 'repo-local';
}

export async function handleIVXDevelopmentControlRequest(request: Request): Promise<Response> {
  const ownerContext = await assertIVXOwnerOnly(request);

  return ownerOnlyJson({
    ok: true,
    ownerOnly: true,
    systemOwner: 'IVX',
    mode: 'senior_developer_control',
    defaultToolPriority: ['IVX-owned repo tools', 'IVX-owned backend routes', 'IVX Supabase server routes', 'IVX deploy scripts'],
    capabilities: CAPABILITIES,
    destructiveActionsRequireConfirmation: true,
    billingCredentialAndPublicDeployRequireConfirmation: true,
    publicDeployAutoRun: false,
    visibleResponsesLeakAuditMetadata: false,
    authenticatedUserId: ownerContext.userId,
    deploymentMarker: DEPLOYMENT_MARKER,
  });
}

export async function handleIVXDevelopmentActionRequest(request: Request): Promise<Response> {
  const ownerContext = await assertIVXOwnerOnly(request);
  const body = await request.json().catch((): IVXDevelopmentActionRequest => ({}));
  const action = normalizeAction(body.action);
  const target = typeof body.target === 'string' ? body.target.trim() : '';

  if (!action) {
    return ownerOnlyJson({
      ok: false,
      ownerOnly: true,
      systemOwner: 'IVX',
      error: 'Unsupported IVX development action.',
      allowedActions: ['inspect', 'patch', 'validate', 'build', 'supabase_read', 'deploy', 'public_deploy'],
      deploymentMarker: DEPLOYMENT_MARKER,
    }, 400);
  }

  const confirmed = isConfirmedAction(action, body);
  const confirmationRequired = !confirmed;

  return ownerOnlyJson({
    ok: confirmed,
    ownerOnly: true,
    systemOwner: 'IVX',
    mode: 'repo_local_action_control',
    action,
    target: target || 'repo',
    scope: getActionScope(action),
    executionOwner: 'IVX',
    mayExecuteNow: confirmed,
    confirmationRequired,
    requiredConfirmationText: action === 'deploy' || action === 'public_deploy' ? ACTION_CONFIRMATION_TEXT[action] : null,
    destructiveActionsRequireConfirmation: true,
    billingCredentialAndPublicDeployRequireConfirmation: true,
    publicDeployAutoRun: false,
    visibleResponsesLeakAuditMetadata: false,
    authenticatedUserId: ownerContext.userId,
    deploymentMarker: DEPLOYMENT_MARKER,
  }, confirmed ? 200 : 409);
}
