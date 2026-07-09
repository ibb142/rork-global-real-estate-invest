/**
 * POST /api/ivx/access/invite — Create or revoke an invite
 * Body: { email?, phone?, role, department, expiresInHours?, auditNote?, action?: 'revoke', inviteId?: string }
 * Owner and admin can invite. Nobody can invite owner.
 */
import {
  resolveEnterpriseAuth,
  jsonResponse,
  handleApiError,
  createInvite,
  revokeInviteRecord,
  requirePermission,
  JSON_HEADERS,
} from '@/lib/enterprise-access-server';
import { type EnterpriseRole, type EnterpriseDepartment, normalizeEnterpriseRole } from '@/constants/enterprise-roles';

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: JSON_HEADERS });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await resolveEnterpriseAuth(request);
    const body = await request.json() as Record<string, unknown>;

    // Revoke mode
    if (body.action === 'revoke' && typeof body.inviteId === 'string') {
      await revokeInviteRecord(auth.client, auth, body.inviteId);
      return jsonResponse({ ok: true, message: 'Invite revoked.' });
    }

    // Create invite
    requirePermission(auth, 'members', 'invite');

    const email = typeof body.email === 'string' ? body.email.trim() || null : null;
    const phone = typeof body.phone === 'string' ? body.phone.trim() || null : null;
    const role = normalizeEnterpriseRole(body.role as string);
    const department = (body.department as EnterpriseDepartment) ?? 'general';
    const expiresInHours = typeof body.expiresInHours === 'number' ? body.expiresInHours : 72;
    const auditNote = typeof body.auditNote === 'string' ? body.auditNote.trim() || null : null;

    if (!email && !phone) {
      return jsonResponse({ error: 'Email or phone is required for invite.' }, 400);
    }

    const invite = await createInvite(auth.client, auth, {
      email: email ?? undefined,
      phone: phone ?? undefined,
      role,
      department,
      expiresInHours,
      auditNote: auditNote ?? undefined,
    });

    // Build invite link
    const appUrl = (process.env.EXPO_PUBLIC_APP_URL ?? 'https://ivxholding.com').trim();
    const inviteLink = `${appUrl}/register?invite=${invite.token}`;

    return jsonResponse({
      ok: true,
      invite: {
        id: invite.id,
        token: invite.token,
        inviteLink,
        expiresAt: invite.expiresAt,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
