import { Tabs } from 'expo-router';
import { BarChart3, Briefcase, Home, LayoutDashboard, MessageCircle, TrendingUp, User } from 'lucide-react-native';
import { DiagnosticErrorBoundary } from '@/components/DiagnosticErrorBoundary';

// IVX Crash Shield: route-level diagnostic error boundary for the entire (tabs)
// segment. A crash in any tab screen surfaces the full error message and stack
// trace on screen instead of Expo's generic blue screen.
export function ErrorBoundary(props: { children: React.ReactNode }) {
  return <DiagnosticErrorBoundary>{props.children}</DiagnosticErrorBoundary>;
}
import React, { useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FloatingChatButton from '@/components/FloatingChatButton';
import { useAuth } from '@/lib/auth-context';

const tabColors = {
  active: '#FFD700',
  inactive: '#777777',
  background: '#000000',
  border: '#242424',
};

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { profileData } = useAuth();
  const isOwner = useMemo(() => {
    const role = ((profileData as { role?: string } | null)?.role ?? '').toLowerCase();
    return role === 'owner' || role === 'admin';
  }, [profileData]);
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
    <View style={styles.root}>
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
      <Tabs.Screen
        name="index"
        options={{
          title: 'CRM',
          tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} strokeWidth={2.3} />,
          tabBarButtonTestID: 'tab-crm',
          href: isOwner ? undefined : null,
        }}
      />
    </Tabs>
    <FloatingChatButton />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
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
