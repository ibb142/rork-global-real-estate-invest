import { Tabs } from 'expo-router';
import { Home, Briefcase, TrendingUp, MessageCircle, User, Landmark } from 'lucide-react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import Colors from '@/constants/colors';
import { useTranslation } from '@/lib/i18n-context';

export default function TabLayout() {
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: '#4A4A4A',
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0D0D0D',
          borderTopColor: 'rgba(255, 215, 0, 0.06)',
          borderTopWidth: StyleSheet.hairlineWidth,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700' as const,
          letterSpacing: 0.4,
          textTransform: 'uppercase',
        },
      }}
    >
      <Tabs.Screen
        name="(home)"
        options={{
          title: t('home'),
          tabBarIcon: ({ color, focused }) => <Home size={21} color={color} strokeWidth={focused ? 2.2 : 1.5} />,
        }}
      />
      <Tabs.Screen
        name="portfolio"
        options={{
          title: t('portfolio'),
          tabBarIcon: ({ color, focused }) => <Briefcase size={21} color={color} strokeWidth={focused ? 2.2 : 1.5} />,
        }}
      />
      <Tabs.Screen
        name="market"
        options={{
          title: t('market'),
          tabBarIcon: ({ color, focused }) => <TrendingUp size={21} color={color} strokeWidth={focused ? 2.2 : 1.5} />,
        }}
      />
      <Tabs.Screen
        name="invest"
        options={{
          title: t('invest'),
          tabBarIcon: ({ color, focused }) => <Landmark size={21} color={color} strokeWidth={focused ? 2.2 : 1.5} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: t('support'),
          tabBarIcon: ({ color, focused }) => <MessageCircle size={21} color={color} strokeWidth={focused ? 2.2 : 1.5} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('profile'),
          tabBarIcon: ({ color, focused }) => <User size={21} color={color} strokeWidth={focused ? 2.2 : 1.5} />,
        }}
      />
    </Tabs>
  );
}
