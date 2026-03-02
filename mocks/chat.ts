import { ChatMessage, SupportTicket } from '@/types';

export const supportMessages: ChatMessage[] = [
  {
    id: 'msg-1',
    senderId: 'support-1',
    senderName: 'IVXHOLDINGS Support',
    senderAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200',
    message: 'Hello! Welcome to IVXHOLDINGS Luxury Holdings support. How can I help you today?',
    timestamp: '2024-12-16T09:00:00Z',
    isSupport: true,
    status: 'read',
  },
  {
    id: 'msg-2',
    senderId: 'user-1',
    senderName: 'You',
    message: 'Hi! I have a question about the dividend distribution schedule.',
    timestamp: '2024-12-16T09:05:00Z',
    isSupport: false,
    status: 'read',
  },
  {
    id: 'msg-3',
    senderId: 'support-1',
    senderName: 'IVXHOLDINGS Support',
    senderAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200',
    message: 'Of course! Dividends are distributed quarterly, typically within the first week of each quarter. For most properties, you can expect distributions in January, April, July, and October.',
    timestamp: '2024-12-16T09:07:00Z',
    isSupport: true,
    status: 'read',
  },
  {
    id: 'msg-4',
    senderId: 'user-1',
    senderName: 'You',
    message: 'Great, thank you! And how do I set up automatic reinvestment?',
    timestamp: '2024-12-16T09:10:00Z',
    isSupport: false,
    status: 'read',
  },
  {
    id: 'msg-5',
    senderId: 'support-1',
    senderName: 'IVXHOLDINGS Support',
    senderAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200',
    message: 'You can enable DRIP (Dividend Reinvestment Plan) in your profile settings under "Investment Preferences". Once enabled, your dividends will automatically purchase additional shares of the same property.',
    timestamp: '2024-12-16T09:12:00Z',
    isSupport: true,
    status: 'delivered',
  },
];

export const supportTickets: SupportTicket[] = [
  {
    id: 'ticket-1',
    subject: 'Dividend Distribution Question',
    category: 'general',
    status: 'in_progress',
    priority: 'low',
    messages: supportMessages,
    createdAt: '2024-12-16T09:00:00Z',
    updatedAt: '2024-12-16T09:12:00Z',
  },
  {
    id: 'ticket-2',
    subject: 'Withdrawal Processing Time',
    category: 'wallet',
    status: 'resolved',
    priority: 'medium',
    messages: [
      {
        id: 'msg-t2-1',
        senderId: 'user-1',
        senderName: 'You',
        message: 'How long does it take for withdrawals to process?',
        timestamp: '2024-12-10T14:00:00Z',
        isSupport: false,
        status: 'read',
      },
      {
        id: 'msg-t2-2',
        senderId: 'support-2',
        senderName: 'IVXHOLDINGS Support',
        senderAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200',
        message: 'Withdrawals typically process within 2-3 business days for ACH transfers and 1-2 business days for wire transfers.',
        timestamp: '2024-12-10T14:30:00Z',
        isSupport: true,
        status: 'read',
      },
    ],
    createdAt: '2024-12-10T14:00:00Z',
    updatedAt: '2024-12-10T14:30:00Z',
  },
];

export const quickReplies = [
  'How do I invest?',
  'Stock trading',
  'Dividend schedule',
  'Withdrawal help',
  'KYC verification',
  'Account settings',
];
