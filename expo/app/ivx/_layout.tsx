import React from 'react';
import { Stack } from 'expo-router';
import Colors from '@/constants/colors';

const IVX_STACK_SCREEN_OPTIONS = {
  headerStyle: { backgroundColor: Colors.background },
  headerTintColor: Colors.text,
  headerTitleStyle: { fontWeight: '700' as const },
  contentStyle: { backgroundColor: Colors.background },
  headerShadowVisible: false,
} as const;

const IVX_INBOX_OPTIONS = { title: 'IVX Inbox' } as const;
const IVX_CHAT_OPTIONS = { title: 'IVX Owner AI', headerShown: false } as const;
const IVX_VARIABLES_OPTIONS = { title: 'Variables / Credentials' } as const;
const IVX_INDEPENDENCE_OPTIONS = { title: 'Independence Tracker' } as const;
const IVX_FILES_OPTIONS = { title: 'Files & Multimodal' } as const;
const IVX_DIAGNOSTICS_OPTIONS = { title: 'IVX Diagnostics' } as const;
const IVX_SEARCH_OPTIONS = { title: 'Search Owner Room' } as const;

export default function IVXOwnerLayout() {
  return (
    <Stack screenOptions={IVX_STACK_SCREEN_OPTIONS}>
      <Stack.Screen name="inbox" options={IVX_INBOX_OPTIONS} />
      <Stack.Screen name="chat" options={IVX_CHAT_OPTIONS} />
      <Stack.Screen name="variables" options={IVX_VARIABLES_OPTIONS} />
      <Stack.Screen name="independence" options={IVX_INDEPENDENCE_OPTIONS} />
      <Stack.Screen name="files" options={IVX_FILES_OPTIONS} />
      <Stack.Screen name="diagnostics" options={IVX_DIAGNOSTICS_OPTIONS} />
      <Stack.Screen name="search" options={IVX_SEARCH_OPTIONS} />
    </Stack>
  );
}
