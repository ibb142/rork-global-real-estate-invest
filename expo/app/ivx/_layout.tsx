import React from 'react';
import { Stack } from 'expo-router';
import Colors from '@/constants/colors';

export default function IVXOwnerLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.background },
        headerTintColor: Colors.text,
        headerTitleStyle: { fontWeight: '700' as const },
        contentStyle: { backgroundColor: Colors.background },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="inbox" options={{ title: 'IVX Inbox' }} />
      <Stack.Screen name="chat" options={{ title: 'IVX Owner AI' }} />
    </Stack>
  );
}
