/**
 * IVX Access Control Service — client-side API for the owner access control dashboard.
 *
 * Wraps the backend role assignment, screen management, force logout, MFA,
 * template, and group endpoints. All calls require an owner bearer token.
 */

import { getApiBaseUrl } from '@/lib/api-base';
import { supabase } from '@/lib/supabase';

export type IVXRoleName =
  | 'owner' | 'ivx_staff' | 'admin' | 'member' | 'investor'
  | 'buyer' | 'jv_partner' | 'influencer' | 'realtor' | 'broker'
  | 'agent' | 'tokenized_investor' | 'lender' | 'auditor'
  | 'analyst' | 'viewer';

export type IVXScreenPermission =
  | 'admin_hq' | 'access_control' | 'members' | 'investors' | 'buyers'
  | 'jv_deals' | 'influencers' | 'realtors' | 'brokers'
  | 'tokenized_investors' | 'ivx_staff' | 'crm' | 'properties'
  | 'transactions' | 'variables' | 'developer_workspace'
  | 'ivx_owner_ai' | 'deploy_approval' | 'github_control'
  | 'render_control' | 'revenue' | 'audit_log' | 'security_box'
  | 'profile' | 'owner_login' | 'owner_console';

export type IVXAccessScope = 'all' | 'own' | 'assigned' | 'regional' | 'none';

export interface IVXRoleDefinition {
  name: IVXRoleName;
  displayName: string;
  permissions: string[];
  screens: IVXScreenPermission[];
  isSystem: boolean;
}

export interface IVXRoleAssignment {
  id: string;
  userId: string;
  userEmail: string;
  role: IVXRoleName;
  assignedBy: string;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'suspended';
  startDate: string | null;
  expirationDate: string | null;
  dataScope: IVXAccessScope;
  screens: IVXScreenPermission[];
  requireMfa: boolean;
  forceLogout: boolean;
}

export interface IVXAccessTemplate {
  id: string;
  name: string;
  description: string;
  role: IVXRoleName;
  screens: IVXScreenPermission[];
  dataScope: IVXAccessScope;
  permissions: string[];
  createdAt: string;
}

export interface IVXAccessGroup {
  id: string;
  name: string;
  description: string;
  memberIds: string[];
  templateId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IVXRolesResponse {
  ok: boolean;
  definitions: IVXRoleDefinition[];
  assignments: IVXRoleAssignment[];
  templates: IVXAccessTemplate[];
  groups: IVXAccessGroup[];
  count: number;
}

export const ALL_IVX_ROLES: { value: IVXRoleName; label: string }[] = [
  { value: 'owner', label: 'Owner' },
  { value: 'ivx_staff', label: 'IVX Staff' },
  { value: 'admin', label: 'Admin' },
  { value: 'member', label: 'Member' },
  { value: 'investor', label: 'Investor' },
  { value: 'buyer', label: 'Buyer' },
  { value: 'jv_partner', label: 'JV Partner' },
  { value: 'influencer', label: 'Influencer' },
  { value: 'realtor', label: 'Realtor' },
  { value: 'broker', label: 'Broker' },
  { value: 'agent', label: 'Agent' },
  { value: 'tokenized_investor', label: 'Tokenized Investor' },
  { value: 'lender', label: 'Lender' },
  { value: 'auditor', label: 'Auditor' },
];

export const ALL_IVX_SCREENS: { value: IVXScreenPermission; label: string }[] = [
  { value: 'admin_hq', label: 'Admin HQ' },
  { value: 'access_control', label: 'Access Control' },
  { value: 'members', label: 'Members' },
  { value: 'investors', label: 'Investors' },
  { value: 'buyers', label: 'Buyers' },
  { value: 'jv_deals', label: 'JV Deals' },
  { value: 'influencers', label: 'Influencers' },
  { value: 'realtors', label: 'Realtors' },
  { value: 'brokers', label: 'Brokers' },
  { value: 'tokenized_investors', label: 'Tokenized Investors' },
  { value: 'ivx_staff', label: 'IVX Staff' },
  { value: 'crm', label: 'CRM' },
  { value: 'properties', label: 'Properties' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'variables', label: 'Variables' },
  { value: 'developer_workspace', label: 'Developer Workspace' },
  { value: 'ivx_owner_ai', label: 'IVX Owner AI' },
  { value: 'deploy_approval', label: 'Deploy Approval' },
  { value: 'github_control', label: 'GitHub Control' },
  { value: 'render_control', label: 'Render Control' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'audit_log', label: 'Audit Log' },
  { value: 'security_box', label: 'Security Box' },
  { value: 'profile', label: 'Profile' },
  { value: 'owner_login', label: 'Owner Login' },
  { value: 'owner_console', label: 'Owner Console' },
];

export const IVX_ACCESS_SCOPES: { value: IVXAccessScope; label: string }[] = [
  { value: 'all', label: 'All Data' },
  { value: 'own', label: 'Own Data Only' },
  { value: 'assigned', label: 'Assigned Data' },
  { value: 'regional', label: 'Regional Scope' },
  { value: 'none', label: 'No Data Access' },
];

async function getOwnerToken(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function apiCall<T>(
  path: string,
  options: { method?: string; body?: Record<string, unknown> } = {},
): Promise<T> {
  const baseUrl = getApiBaseUrl().replace(/\/$/, '');
  const token = await getOwnerToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    // Non-JSON response
  }

  if (!response.ok && parsed.ok !== true) {
    const error = typeof parsed.error === 'string' ? parsed.error : `API error (HTTP ${response.status})`;
    throw new Error(error);
  }

  return parsed as unknown as T;
}

export async function fetchRolesAndAssignments(): Promise<IVXRolesResponse> {
  return apiCall<IVXRolesResponse>('/api/ivx/roles');
}

export async function assignRoleToUser(input: {
  userId: string;
  userEmail: string;
  role: IVXRoleName;
  screens?: IVXScreenPermission[];
  dataScope?: IVXAccessScope;
  startDate?: string | null;
  expirationDate?: string | null;
  requireMfa?: boolean;
}): Promise<{ ok: boolean; assignment: IVXRoleAssignment }> {
  return apiCall('/api/ivx/roles/assign', {
    method: 'POST',
    body: {
      userId: input.userId,
      userEmail: input.userEmail,
      role: input.role,
      screens: input.screens ?? [],
      dataScope: input.dataScope ?? 'assigned',
      startDate: input.startDate ?? null,
      expirationDate: input.expirationDate ?? null,
      requireMfa: input.requireMfa ?? false,
    },
  });
}

export async function revokeRoleFromUser(userId: string): Promise<{ ok: boolean; revoked: boolean }> {
  return apiCall('/api/ivx/roles/revoke', {
    method: 'POST',
    body: { userId },
  });
}

export async function setAssignmentStatus(
  userId: string,
  status: 'active' | 'suspended',
): Promise<{ ok: boolean; assignment: IVXRoleAssignment }> {
  return apiCall('/api/ivx/access/status', {
    method: 'POST',
    body: { userId, status },
  });
}

export async function forceLogoutUser(userId: string): Promise<{ ok: boolean; assignment: IVXRoleAssignment }> {
  return apiCall('/api/ivx/access/force-logout', {
    method: 'POST',
    body: { userId },
  });
}

export async function clearForceLogout(userId: string): Promise<{ ok: boolean; assignment: IVXRoleAssignment }> {
  return apiCall('/api/ivx/access/clear-force-logout', {
    method: 'POST',
    body: { userId },
  });
}

export async function updateUserScreens(
  userId: string,
  screens: IVXScreenPermission[],
): Promise<{ ok: boolean; assignment: IVXRoleAssignment }> {
  return apiCall('/api/ivx/access/screens', {
    method: 'POST',
    body: { userId, screens },
  });
}

export async function setMfaRequirement(
  userId: string,
  requireMfa: boolean,
): Promise<{ ok: boolean; assignment: IVXRoleAssignment }> {
  return apiCall('/api/ivx/access/mfa', {
    method: 'POST',
    body: { userId, requireMfa },
  });
}

export async function createAccessTemplate(input: {
  name: string;
  description: string;
  role: IVXRoleName;
  screens: IVXScreenPermission[];
  dataScope: IVXAccessScope;
  permissions: string[];
}): Promise<{ ok: boolean; template: IVXAccessTemplate }> {
  return apiCall('/api/ivx/access/templates', {
    method: 'POST',
    body: input,
  });
}

export async function deleteAccessTemplate(id: string): Promise<{ ok: boolean; deleted: boolean }> {
  return apiCall('/api/ivx/access/templates/delete', {
    method: 'POST',
    body: { id },
  });
}

export async function createAccessGroup(input: {
  name: string;
  description: string;
  memberIds: string[];
  templateId: string | null;
}): Promise<{ ok: boolean; group: IVXAccessGroup }> {
  return apiCall('/api/ivx/access/groups', {
    method: 'POST',
    body: input,
  });
}

export async function deleteAccessGroup(id: string): Promise<{ ok: boolean; deleted: boolean }> {
  return apiCall('/api/ivx/access/groups/delete', {
    method: 'POST',
    body: { id },
  });
}
