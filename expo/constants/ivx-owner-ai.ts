export type IVXOwnerAIPlatform = 'web_and_mobile';
export type IVXOwnerAIAudience = 'owner_only';
export type IVXOwnerAICodeAccess = 'yes' | 'no';
export type IVXOwnerAIFeatureId =
  | 'ai_chat'
  | 'inbox'
  | 'shared_room'
  | 'file_upload';

export const IVX_OWNER_AI_ROOM_ID = '8f5a9c42-1cb5-4f81-b2d8-6f3a0a8b9d41';
export const IVX_OWNER_AI_ROOM_SLUG = 'ivx-owner-room';

export const IVX_OWNER_AI_FEATURE_LABELS: Record<IVXOwnerAIFeatureId, string> = {
  ai_chat: 'AI chat',
  inbox: 'Inbox',
  shared_room: 'Shared room',
  file_upload: 'File upload',
};

export const IVX_OWNER_AI_PROFILE = {
  name: 'IVX Owner AI',
  platform: 'web_and_mobile' as IVXOwnerAIPlatform,
  audience: 'owner_only' as IVXOwnerAIAudience,
  codeAccess: 'no' as IVXOwnerAICodeAccess,
  stack: ['Next.js', 'Expo', 'Supabase'] as const,
  features: [
    'ai_chat',
    'inbox',
    'shared_room',
    'file_upload',
  ] as const satisfies readonly IVXOwnerAIFeatureId[],
  sharedRoom: {
    id: IVX_OWNER_AI_ROOM_ID,
    slug: IVX_OWNER_AI_ROOM_SLUG,
    title: 'IVX Owner AI Room',
    subtitle: 'Owner workspace. Live sync and AI features depend on the active room backend.',
    badgeText: 'Owner AI',
    emptyTitle: 'No owner messages yet',
    emptyText: 'Start with a note, message, image, video, or document.',
    capabilityPills: ['AI chat', 'Inbox sync', 'Shared room', 'File upload'] as const,
  },
  support: {
    assistantDisplayName: 'IVX Owner AI',
    welcomeMessage:
      'Hello - I am IVX Owner AI. I can help with owner chat, inbox triage, shared-room updates, and file uploads across web and mobile.',
    quickReplies: [
      'Show my owner inbox',
      'Summarize the shared room',
      'Help me upload a file',
      'What can you help with?',
    ] as const,
  },
} as const;

export const IVX_OWNER_AI_BRIEF_DEFAULTS = {
  platform: IVX_OWNER_AI_PROFILE.platform,
  audience: IVX_OWNER_AI_PROFILE.audience,
  codeAccess: 'no' as IVXOwnerAICodeAccess,
  aiName: IVX_OWNER_AI_PROFILE.name,
  selectedFeatures: [...IVX_OWNER_AI_PROFILE.features],
  customFeatures: '',
  stack: [...IVX_OWNER_AI_PROFILE.stack],
} as const;
