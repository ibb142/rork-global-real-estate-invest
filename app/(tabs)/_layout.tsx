import { Tabs } from 'expo-router';
import { Home, Briefcase, TrendingUp, MessageCircle, User, Landmark } from 'lucide-react-native';
import React from 'react';

import Colors from '@/constants/colors';
import { useTranslation } from '@/lib/i18n-context';

export default function TabLayout() {
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textTertiary,
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.tabBar,
          borderTopColor: Colors.tabBarBorder,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600' as const,
        },
      }}
    >
      <Tabs.Screen
        name="(home)"
        options={{
          title: t('home'),
          tabBarIcon: ({ color, size }) => <Home size={22} color={color} strokeWidth={1.8} />,
        }}
      />
      <Tabs.Screen
        name="portfolio"
        options={{
          title: t('portfolio'),
          tabBarIcon: ({ color, size }) => <Briefcase size={22} color={color} strokeWidth={1.8} />,
        }}
      />
      <Tabs.Screen
        name="market"
        options={{
          title: t('market'),
          tabBarIcon: ({ color, size }) => <TrendingUp size={22} color={color} strokeWidth={1.8} />,
        }}
      />
      <Tabs.Screen
        name="invest"
        options={{
          title: t('invest'),
          tabBarIcon: ({ color, size }) => <Landmark size={22} color={color} strokeWidth={1.8} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: t('support'),
          tabBarIcon: ({ color, size }) => <MessageCircle size={22} color={color} strokeWidth={1.8} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('profile'),
          tabBarIcon: ({ color, size }) => <User size={22} color={color} strokeWidth={1.8} />,
        }}
      />
    </Tabs>
  );
}
