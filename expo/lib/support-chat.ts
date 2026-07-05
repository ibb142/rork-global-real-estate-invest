import { supabase } from '@/lib/supabase';
import type { ChatMessage, SupportTicket } from '@/types';

export type TicketCategory = SupportTicket['category'];
export type TicketStatus = SupportTicket['status'];
export type TicketPriority = SupportTicket['priority'];

export interface SupportTicketRow {
  id: string;
  subject?: string | null;
  category?: TicketCategory | null;
  status?: TicketStatus | null;
  priority?: TicketPriority | null;
  messages?: Array<{
    id?: string | null;
    senderId?: string | null;
    senderName?: string | null;
    message?: string | null;
    timestamp?: string | null;
    isSupport?: boolean | null;
    status?: ChatMessage['status'] | null;
  }> | null;
  created_at?: string | null;
  updated_at?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface SupportTicketItem extends SupportTicket {
  category: TicketCategory;
  status: TicketStatus;
  priority: TicketPriority;
}

export interface CreateSupportTicketParams {
  subject: string;
  category: TicketCategory;
  message: string;
  priority?: TicketPriority;
}

export interface LiveSupportTicketDraft {
  subject: string;
  message: string;
  category: TicketCategory;
  priority: TicketPriority;
}

function getFallbackCreatedAt(): string {
  return new Date().toISOString();
}

function getRecentUserContext(messages: ChatMessage[]): string {
  return messages
    .slice(-6)
    .filter((message) => !message.isSupport)
    .map((message) => message.message)
    .join(' | ')
    .trim();
}

function classifySupportCategory(recentContext: string): TicketCategory {
  const lower = recentContext.toLowerCase();

  if (/kyc|identity|verification|verify|document/i.test(lower)) {
    return 'kyc';
  }

  if (/wallet|withdraw|withdrawal|deposit|payout|cash out/i.test(lower)) {
    return 'wallet';
  }

  if (/invest|deal|allocation|buy|purchase|trade|dividend/i.test(lower)) {
    return 'trading';
  }

  if (/technical|frontend|backend|api|server|database|supabase|aws|amazon|s3|cloudfront|chatgpt|openai|bug|crash|incident|error|deploy|deployment|infrastructure|code/i.test(lower)) {
    return 'technical';
  }

  return 'general';
}

function classifySupportPriority(recentContext: string): TicketPriority {
  const lower = recentContext.toLowerCase();

  if (/security|breach|fraud|payment failed|funds missing|outage|production down|crash|cannot login|locked out|urgent/i.test(lower)) {
    return 'high';
  }

  if (/technical|bug|error|aws|cloudfront|supabase|chatgpt|openai|api|deployment|incident/i.test(lower)) {
    return 'medium';
  }

  return 'low';
}

export function mapSupportTicketRows(rows: SupportTicketRow[]): SupportTicketItem[] {
  return rows.map((ticket) => ({
    id: ticket.id,
    subject: ticket.subject ?? 'Support request',
    category: ticket.category ?? 'general',
    status: ticket.status ?? 'open',
    priority: ticket.priority ?? 'medium',
    messages: Array.isArray(ticket.messages)
      ? ticket.messages.map((message, index) => ({
          id: message.id ?? `${ticket.id}-message-${index}`,
          senderId: message.senderId ?? 'support',
          senderName: message.senderName ?? (message.isSupport ? 'IVXHOLDINGS Support' : 'You'),
          senderAvatar: '',
          message: message.message ?? '',
          timestamp: message.timestamp ?? ticket.created_at ?? ticket.createdAt ?? getFallbackCreatedAt(),
          isSupport: message.isSupport ?? false,
          status: message.status ?? 'delivered',
        }))
      : [],
    createdAt: ticket.created_at ?? ticket.createdAt ?? getFallbackCreatedAt(),
    updatedAt: ticket.updated_at ?? ticket.updatedAt ?? ticket.created_at ?? ticket.createdAt ?? getFallbackCreatedAt(),
  }));
}

export async function fetchUserSupportTickets(): Promise<SupportTicketRow[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.log('[SupportChat] No authenticated user found while fetching tickets');
    return [];
  }

  const { data, error } = await supabase
    .from('support_tickets')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.log('[SupportChat] Ticket fetch error:', error.message);
    return [];
  }

  console.log('[SupportChat] Loaded tickets:', Array.isArray(data) ? data.length : 0);
  return (data ?? []) as SupportTicketRow[];
}

export async function createSupportTicket(params: CreateSupportTicketParams): Promise<SupportTicketRow> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('support_tickets')
    .insert({
      ...params,
      user_id: user?.id ?? null,
      status: 'open',
      priority: params.priority ?? 'medium',
    })
    .select()
    .single();

  if (error) {
    console.error('[SupportChat] Create ticket error:', error);
    throw error;
  }

  console.log('[SupportChat] Ticket created:', data.id, 'category:', params.category, 'hasUser:', !!user?.id);
  return data as SupportTicketRow;
}

export function buildLiveSupportTicketDraft(
  messages: ChatMessage[],
  subjectPrefix: string = 'Live Chat'
): LiveSupportTicketDraft {
  const recentContext = getRecentUserContext(messages);
  const category = classifySupportCategory(recentContext);
  const priority = classifySupportPriority(recentContext);
  const categoryLabel = category === 'technical' ? 'Technical' : category === 'trading' ? 'Investment' : category === 'wallet' ? 'Wallet' : category === 'kyc' ? 'KYC' : 'Support';
  const resolvedSubjectPrefix = category === 'technical' ? 'Technical Live Chat' : `${categoryLabel} ${subjectPrefix}`;
  const subject = recentContext.length > 10
    ? `${resolvedSubjectPrefix}: ${recentContext.slice(0, 80)}${recentContext.length > 80 ? '…' : ''}`
    : `${resolvedSubjectPrefix} Request`;
  const message = recentContext.length > 10
    ? `User requested ${categoryLabel.toLowerCase()} support after discussing: ${recentContext.slice(0, 240)}`
    : 'I would like to speak with a human support agent.';

  return {
    subject,
    message,
    category,
    priority,
  };
}
