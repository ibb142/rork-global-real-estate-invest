import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { LayoutDashboard, Crown, Users, ArrowLeftRight, FileText } from 'lucide-react-native';
import Colors from '@/constants/colors';

export default function AdminLayout() {
  return (
    <View style={styles.container}>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: '#555555',
        tabBarStyle: {
          backgroundColor: '#0D0D0D',
          borderTopColor: 'rgba(255, 215, 0, 0.08)',
          borderTopWidth: StyleSheet.hairlineWidth,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700' as const,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          marginTop: 2,
        },
        tabBarIconStyle: {
          marginBottom: -2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <LayoutDashboard size={20} color={color} strokeWidth={focused ? 2.2 : 1.5} />
          ),
        }}
      />
      <Tabs.Screen
        name="owner-controls"
        options={{
          title: 'Owner',
          tabBarIcon: ({ color, focused }) => (
            <Crown size={20} color={color} strokeWidth={focused ? 2.2 : 1.5} />
          ),
        }}
      />
      <Tabs.Screen
        name="members"
        options={{
          title: 'Team',
          tabBarIcon: ({ color, focused }) => (
            <Users size={20} color={color} strokeWidth={focused ? 2.2 : 1.5} />
          ),
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Txns',
          tabBarIcon: ({ color, focused }) => (
            <ArrowLeftRight size={20} color={color} strokeWidth={focused ? 2.2 : 1.5} />
          ),
        }}
      />
      <Tabs.Screen
        name="applications"
        options={{
          title: 'Apps',
          tabBarIcon: ({ color, focused }) => (
            <FileText size={20} color={color} strokeWidth={focused ? 2.2 : 1.5} />
          ),
        }}
      />
      <Tabs.Screen
        name="investor-profits"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="properties"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="marketing"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="team"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="fees"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="land-partners"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="engagement"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="broadcast"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="growth"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="influencers"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="banners"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="intro"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="app-docs"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="social-command"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="member"
        options={{
          href: null,
        }}
      />



      <Tabs.Screen
        name="title-companies"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="lender-directory"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="ai-outreach"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="lender-search"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="outreach-analytics"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="email-engine"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="lender-sync"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="ai-video"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="developer-handoff"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="api-keys"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="email-inbox"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="email-management"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="email-accounts"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="lead-intelligence"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="traffic-control"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="viral-growth"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="landing-analytics"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="system-monitor"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="visitor-intelligence"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="staff-activity"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="retargeting"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="jv-deals"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="trash-bin"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="system-map"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="audit-log"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="data-recovery"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="publication-log"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="supabase-scripts"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="image-backup"
        options={{
          href: null,
        }}
      />
    </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});
