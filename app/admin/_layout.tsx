import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { LayoutDashboard, Users, ArrowLeftRight, Crown, TrendingUp, FileText } from 'lucide-react-native';
import Colors from '@/constants/colors';



export default function AdminLayout() {
  return (
    <View style={styles.container}>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textSecondary,
        tabBarStyle: {
          backgroundColor: Colors.card,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 4,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => (
            <LayoutDashboard size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="owner-controls"
        options={{
          title: 'Owner',
          tabBarIcon: ({ color, size }) => (
            <Crown size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="investor-profits"
        options={{
          title: 'Profits',
          tabBarIcon: ({ color, size }) => (
            <TrendingUp size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="members"
        options={{
          title: 'Members',
          tabBarIcon: ({ color, size }) => (
            <Users size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Transactions',
          tabBarIcon: ({ color, size }) => (
            <ArrowLeftRight size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="applications"
        options={{
          title: 'Applications',
          tabBarIcon: ({ color, size }) => (
            <FileText size={size} color={color} />
          ),
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
    </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

});
