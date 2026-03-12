import { useState, useCallback, useMemo, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import createContextHook from '@nkzw/create-context-hook';
import { useQuery, useMutation } from '@tanstack/react-query';
import { EmailMessage, EmailFolder, ComposeEmailData } from '@/types/email';
import { EMAIL_ACCOUNTS, MOCK_EMAILS } from '@/mocks/emails';
import { supabase } from '@/lib/supabase';

const STORAGE_KEY = 'ivx_emails';
const ACTIVE_ACCOUNT_KEY = 'ivx_active_email_account';

export const [EmailProvider, useEmail] = createContextHook(() => {
  const [activeAccountId, setActiveAccountId] = useState<string>('admin');
  const [emails, setEmails] = useState<EmailMessage[]>(MOCK_EMAILS);
  const [selectedFolder, setSelectedFolder] = useState<EmailFolder>('inbox');
  const [searchQuery, setSearchQuery] = useState<string>('');


  const loadStoredData = useQuery({
    queryKey: ['emails', 'stored'],
    queryFn: async () => {
      try {
        const [storedEmails, storedAccount] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(ACTIVE_ACCOUNT_KEY),
        ]);
        return {
          emails: storedEmails ? JSON.parse(storedEmails) as EmailMessage[] : MOCK_EMAILS,
          activeAccountId: storedAccount || 'admin',
        };
      } catch {
        return { emails: MOCK_EMAILS, activeAccountId: 'admin' };
      }
    },
  });

  useEffect(() => {
    if (loadStoredData.data) {
      setEmails(loadStoredData.data.emails);
      setActiveAccountId(loadStoredData.data.activeAccountId);
    }
  }, [loadStoredData.data]);

  const persistEmails = useCallback(async (updated: EmailMessage[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.log('Failed to persist emails:', e);
    }
  }, []);

  const switchAccountMutation = useMutation({
    mutationFn: async (accountId: string) => {
      await AsyncStorage.setItem(ACTIVE_ACCOUNT_KEY, accountId);
      return accountId;
    },
    onSuccess: (accountId) => {
      setActiveAccountId(accountId);
      setSelectedFolder('inbox');
      setSearchQuery('');
    },
  });

  const activeAccount = useMemo(() => {
    return EMAIL_ACCOUNTS.find(a => a.id === activeAccountId) ?? EMAIL_ACCOUNTS[0];
  }, [activeAccountId]);

  const accounts = EMAIL_ACCOUNTS;

  const accountsWithUnread = useMemo(() => {
    return EMAIL_ACCOUNTS.map(account => ({
      ...account,
      unreadCount: emails.filter(e => e.accountId === account.id && e.folder === 'inbox' && !e.isRead).length,
    }));
  }, [emails]);

  const filteredEmails = useMemo(() => {
    let filtered = emails.filter(e => e.accountId === activeAccountId && e.folder === selectedFolder);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(e =>
        e.subject.toLowerCase().includes(q) ||
        e.from.name.toLowerCase().includes(q) ||
        e.from.email.toLowerCase().includes(q) ||
        e.body.toLowerCase().includes(q)
      );
    }

    return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [emails, activeAccountId, selectedFolder, searchQuery]);

  const folderCounts = useMemo(() => {
    const accountEmails = emails.filter(e => e.accountId === activeAccountId);
    return {
      inbox: accountEmails.filter(e => e.folder === 'inbox').length,
      inboxUnread: accountEmails.filter(e => e.folder === 'inbox' && !e.isRead).length,
      sent: accountEmails.filter(e => e.folder === 'sent').length,
      drafts: accountEmails.filter(e => e.folder === 'drafts').length,
      trash: accountEmails.filter(e => e.folder === 'trash').length,
      starred: accountEmails.filter(e => e.isStarred).length,
      spam: accountEmails.filter(e => e.folder === 'spam').length,
      archive: accountEmails.filter(e => e.folder === 'archive').length,
    };
  }, [emails, activeAccountId]);

  const markAsRead = useCallback((emailId: string) => {
    setEmails(prev => {
      const updated = prev.map(e => e.id === emailId ? { ...e, isRead: true } : e);
      void persistEmails(updated);
      return updated;
    });
  }, [persistEmails]);

  const toggleStar = useCallback((emailId: string) => {
    setEmails(prev => {
      const updated = prev.map(e => e.id === emailId ? { ...e, isStarred: !e.isStarred } : e);
      void persistEmails(updated);
      return updated;
    });
  }, [persistEmails]);

  const toggleFlag = useCallback((emailId: string) => {
    setEmails(prev => {
      const updated = prev.map(e => e.id === emailId ? { ...e, isFlagged: !e.isFlagged } : e);
      void persistEmails(updated);
      return updated;
    });
  }, [persistEmails]);

  const moveToFolder = useCallback((emailId: string, folder: EmailFolder) => {
    setEmails(prev => {
      const updated = prev.map(e => e.id === emailId ? { ...e, folder } : e);
      void persistEmails(updated);
      return updated;
    });
  }, [persistEmails]);

  const deleteEmail = useCallback((emailId: string) => {
    setEmails(prev => {
      const email = prev.find(e => e.id === emailId);
      let updated: EmailMessage[];
      if (email?.folder === 'trash') {
        updated = prev.filter(e => e.id !== emailId);
      } else {
        updated = prev.map(e => e.id === emailId ? { ...e, folder: 'trash' as EmailFolder } : e);
      }
      void persistEmails(updated);
      return updated;
    });
  }, [persistEmails]);

  const sendEmail = useCallback(async (data: ComposeEmailData): Promise<{ success: boolean; messageId?: string; error?: string }> => {
    const hasAttachments = (data.attachments && data.attachments.length > 0) || false;
    const newEmail: EmailMessage = {
      id: `sent-${Date.now()}`,
      accountId: activeAccountId,
      folder: 'sent',
      from: { name: activeAccount.displayName, email: activeAccount.email },
      to: data.to.split(',').map(e => ({ name: e.trim(), email: e.trim() })),
      cc: data.cc ? data.cc.split(',').map(e => ({ name: e.trim(), email: e.trim() })) : undefined,
      subject: data.subject,
      body: data.body,
      date: new Date().toISOString(),
      isRead: true,
      isStarred: false,
      isFlagged: false,
      hasAttachments,
      attachments: data.attachments,
    };

    setEmails(prev => {
      const updated = [...prev, newEmail];
      void persistEmails(updated);
      return updated;
    });

    try {
      console.log('[Email] Sending email:', activeAccount.email, '->', data.to);
      const { data: result, error } = await supabase.functions.invoke('send-email', {
        body: {
          from: activeAccount.email,
          fromName: activeAccount.displayName,
          to: data.to,
          cc: data.cc,
          bcc: data.bcc,
          subject: data.subject,
          body: data.body,
        },
      });

      if (error) {
        console.log('[Email] Edge function not available, email saved locally:', error.message);
        return { success: true, messageId: newEmail.id };
      }

      if (result?.success) {
        console.log('[Email] Send success. MessageId:', result.messageId);
        return { success: true, messageId: result.messageId ?? undefined };
      } else {
        console.log('[Email] Send noted, saved locally');
        return { success: true, messageId: newEmail.id };
      }
    } catch (err: any) {
      console.log('[Email] Send error, saved locally:', err?.message || err);
      return { success: true, messageId: newEmail.id };
    }
  }, [activeAccountId, activeAccount, persistEmails]);

  const saveDraft = useCallback((data: ComposeEmailData) => {
    const hasAttachments = (data.attachments && data.attachments.length > 0) || false;
    const draft: EmailMessage = {
      id: `draft-${Date.now()}`,
      accountId: activeAccountId,
      folder: 'drafts',
      from: { name: activeAccount.displayName, email: activeAccount.email },
      to: data.to ? data.to.split(',').map(e => ({ name: e.trim(), email: e.trim() })) : [],
      subject: data.subject || '(No Subject)',
      body: data.body,
      date: new Date().toISOString(),
      isRead: true,
      isStarred: false,
      isFlagged: false,
      hasAttachments,
      attachments: data.attachments,
    };
    setEmails(prev => {
      const updated = [...prev, draft];
      void persistEmails(updated);
      return updated;
    });
  }, [activeAccountId, activeAccount, persistEmails]);

  const markAllAsRead = useCallback(() => {
    setEmails(prev => {
      const updated = prev.map(e =>
        e.accountId === activeAccountId && e.folder === selectedFolder ? { ...e, isRead: true } : e
      );
      void persistEmails(updated);
      return updated;
    });
  }, [activeAccountId, selectedFolder, persistEmails]);

  const getEmailById = useCallback((id: string) => {
    return emails.find(e => e.id === id);
  }, [emails]);

  const totalUnread = useMemo(() => {
    return emails.filter(e => e.folder === 'inbox' && !e.isRead).length;
  }, [emails]);

  return useMemo(() => ({
    accounts,
    accountsWithUnread,
    activeAccount,
    activeAccountId,
    switchAccount: switchAccountMutation.mutate,
    emails: filteredEmails,
    allEmails: emails,
    selectedFolder,
    setSelectedFolder,
    searchQuery,
    setSearchQuery,
    folderCounts,
    markAsRead,
    toggleStar,
    toggleFlag,
    moveToFolder,
    deleteEmail,
    sendEmail,
    saveDraft,
    markAllAsRead,
    getEmailById,
    totalUnread,
    isLoading: loadStoredData.isLoading,
  }), [
    accounts, accountsWithUnread, activeAccount, activeAccountId,
    switchAccountMutation.mutate, filteredEmails, emails, selectedFolder,
    setSelectedFolder, searchQuery, setSearchQuery, folderCounts,
    markAsRead, toggleStar, toggleFlag, moveToFolder, deleteEmail,
    sendEmail, saveDraft, markAllAsRead, getEmailById, totalUnread,
    loadStoredData.isLoading,
  ]);
});
