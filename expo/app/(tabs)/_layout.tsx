import { Tabs } from 'expo-router';
import { BarChart3, Briefcase, Home, MessageCircle, TrendingUp, User } from 'lucide-react-native';
import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const tabColors = {
  active: '#FFD700',
  inactive: '#777777',
  background: '#000000',
  border: '#242424',
};

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const androidBottomInset = Platform.OS === 'android' ? Math.max(insets.bottom, 10) : insets.bottom;
  const tabBarHeight = Platform.select({
    ios: 82,
    android: 76 + androidBottomInset,
    default: 72 + androidBottomInset,
  });
  const tabBarPaddingBottom = Platform.select({
    ios: 22,
    android: androidBottomInset,
    default: androidBottomInset,
  });

  return (
    <Tabs
      initialRouteName="(home)"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: tabColors.active,
        tabBarInactiveTintColor: tabColors.inactive,
        tabBarHideOnKeyboard: true,
        tabBarStyle: [styles.tabBar, { height: tabBarHeight, paddingBottom: tabBarPaddingBottom }],
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarItemStyle: styles.tabBarItem,
        tabBarIconStyle: styles.tabBarIcon,
      }}
    >
      <Tabs.Screen
        name="(home)"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} strokeWidth={2.3} />,
          tabBarButtonTestID: 'tab-home',
        }}
      />
      <Tabs.Screen
        name="invest"
        options={{
          title: 'Invest',
          tabBarIcon: ({ color, size }) => <TrendingUp color={color} size={size} strokeWidth={2.3} />,
          tabBarButtonTestID: 'tab-invest',
        }}
      />
      <Tabs.Screen
        name="market"
        options={{
          title: 'Market',
          tabBarIcon: ({ color, size }) => <BarChart3 color={color} size={size} strokeWidth={2.3} />,
          tabBarButtonTestID: 'tab-market',
        }}
      />
      <Tabs.Screen
        name="portfolio"
        options={{
          title: 'Portfolio',
          tabBarIcon: ({ color, size }) => <Briefcase color={color} size={size} strokeWidth={2.3} />,
          tabBarButtonTestID: 'tab-portfolio',
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color, size }) => <MessageCircle color={color} size={size} strokeWidth={2.3} />,
          tabBarButtonTestID: 'tab-chat',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <User color={color} size={size} strokeWidth={2.3} />,
          tabBarButtonTestID: 'tab-profile',
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: tabColors.background,
    borderTopColor: tabColors.border,
    borderTopWidth: 0.5,
    paddingTop: Platform.select({ ios: 6, android: 8, default: 8 }),
  },
  tabBarItem: {
    paddingVertical: 0,
    justifyContent: 'center',
  },
  tabBarIcon: {
    marginTop: 0,
    marginBottom: 1,
  },
  tabBarLabel: {
    fontSize: 10,
    fontWeight: '600' as const,
    marginTop: 0,
  },
});
