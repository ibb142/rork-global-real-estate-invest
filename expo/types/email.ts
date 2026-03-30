export interface EmailAccount {
  id: string;
  email: string;
  displayName: string;
  role: string;
  avatar: string;
  color: string;
  unreadCount: number;
}

export type EmailSource = 'backend' | 'ses-inbound' | 'gmail' | 'supabase' | 'local-draft' | 'local-sent' | 'cache' | 'unknown';

export interface EmailMessage {
  id: string;
  accountId: string;
  folder: EmailFolder;
  from: EmailContact;
  to: EmailContact[];
  cc?: EmailContact[];
  bcc?: EmailContact[];
  subject: string;
  body: string;
  bodyHtml?: string;
  date: string;
  isRead: boolean;
  isStarred: boolean;
  isFlagged: boolean;
  hasAttachments: boolean;
  attachments?: EmailAttachment[];
  replyTo?: string;
  labels?: string[];
  priority?: 'low' | 'normal' | 'high';
  source?: EmailSource;
}

export interface EmailContact {
  name: string;
  email: string;
}

export interface EmailAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  uri?: string;
  mimeType?: string;
}

export type EmailFolder = 'inbox' | 'sent' | 'drafts' | 'trash' | 'starred' | 'spam' | 'archive';

export interface EmailLabel {
  id: string;
  name: string;
  color: string;
}

export interface ComposeEmailData {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  replyToId?: string;
  forwardFromId?: string;
  attachments?: EmailAttachment[];
}
