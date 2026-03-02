import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Modal, ScrollView, Dimensions } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus, X, UsersRound, Percent, Image, Play, BookOpen, Radio, Heart, Megaphone, TrendingUp, Star, Zap, KeyRound, Building2, Landmark, Sparkles, Globe, BarChart3, Mail, Video, Code2, Scale } from 'lucide-react-native';
import Colors from '@/constants/colors';



interface FABMenuItem {
  id: string;
  title: string;
  icon: React.ReactNode;
  route: string;
}

const fabMenuItems: FABMenuItem[] = [
  {
    id: 'team',
    title: 'Team',
    icon: <UsersRound size={18} color={Colors.background} />,
    route: '/admin/team',
  },
  {
    id: 'fees',
    title: 'Fees',
    icon: <Percent size={18} color={Colors.background} />,
    route: '/admin/fees',
  },
  {
    id: 'banners',
    title: 'Banners',
    icon: <Image size={18} color={Colors.background} />,
    route: '/admin/banners',
  },
  {
    id: 'intro',
    title: 'Intro',
    icon: <Play size={18} color={Colors.background} />,
    route: '/admin/intro',
  },

  {
    id: 'app-docs',
    title: 'App Docs',
    icon: <BookOpen size={18} color={Colors.background} />,
    route: '/admin/app-docs',
  },
  {
    id: 'social-command',
    title: 'AI Social',
    icon: <Radio size={18} color={Colors.background} />,
    route: '/admin/social-command',
  },
  {
    id: 'engagement',
    title: 'Engagement',
    icon: <Heart size={18} color={Colors.background} />,
    route: '/admin/engagement',
  },
  {
    id: 'broadcast',
    title: 'Broadcast',
    icon: <Megaphone size={18} color={Colors.background} />,
    route: '/admin/broadcast',
  },
  {
    id: 'growth',
    title: 'Growth',
    icon: <TrendingUp size={18} color={Colors.background} />,
    route: '/admin/growth',
  },
  {
    id: 'influencers',
    title: 'Influencers',
    icon: <Star size={18} color={Colors.background} />,
    route: '/admin/influencers',
  },

  {
    id: 'title-companies',
    title: 'Title Cos',
    icon: <Building2 size={18} color={Colors.background} />,
    route: '/admin/title-companies',
  },
  {
    id: 'lender-directory',
    title: 'Lenders',
    icon: <Landmark size={18} color={Colors.background} />,
    route: '/admin/lender-directory',
  },
  {
    id: 'ai-outreach',
    title: 'AI Outreach',
    icon: <Sparkles size={18} color={Colors.background} />,
    route: '/admin/ai-outreach',
  },
  {
    id: 'lender-search',
    title: 'Find Lenders',
    icon: <Globe size={18} color={Colors.background} />,
    route: '/admin/lender-search',
  },
  {
    id: 'outreach-analytics',
    title: 'Outreach CRM',
    icon: <BarChart3 size={18} color={Colors.background} />,
    route: '/admin/outreach-analytics',
  },
  {
    id: 'email-engine',
    title: 'Email Engine',
    icon: <Mail size={18} color={Colors.background} />,
    route: '/admin/email-engine',
  },
  {
    id: 'ai-video',
    title: 'AI Studio',
    icon: <Video size={18} color={Colors.background} />,
    route: '/admin/ai-video',
  },
  {
    id: 'developer-handoff',
    title: 'Dev Guide',
    icon: <Code2 size={18} color={Colors.background} />,
    route: '/admin/developer-handoff',
  },
  {
    id: 'contract-generator',
    title: 'Contracts',
    icon: <Scale size={18} color={Colors.background} />,
    route: '/contract-generator',
  },
  {
    id: 'api-keys',
    title: 'API Keys',
    icon: <KeyRound size={18} color={Colors.background} />,
    route: '/admin/api-keys',
  },
  {
    id: 'share-content',
    title: 'Share Hub',
    icon: <Zap size={18} color={Colors.background} />,
    route: '/share-content',
  },
];

const TAB_ROUTES = ['/', '/portfolio', '/market', '/invest', '/chat', '/profile'];

export default function AdminFAB() {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const isOnTabScreen = TAB_ROUTES.some(route =>
    pathname === route ||
    pathname.startsWith('/invest') ||
    pathname === '/'
  );
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0)).current;

  const toggleMenu = () => {
    const toValue = isOpen ? 0 : 1;
    
    Animated.parallel([
      Animated.spring(rotateAnim, {
        toValue,
        useNativeDriver: true,
        friction: 5,
      }),
      Animated.spring(scaleAnim, {
        toValue,
        useNativeDriver: true,
        friction: 6,
      }),
    ]).start();
    
    setIsOpen(!isOpen);
  };

  const handleMenuPress = (route: string) => {
    toggleMenu();
    router.push(route as any);
  };

  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '45deg'],
  });

  return (
    <>
      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={toggleMenu}
      >
        <View style={styles.overlay}>
          <View style={styles.headerContainer}>
            <Text style={styles.menuTitle}>Quick Actions</Text>
            <TouchableOpacity
              style={styles.closeButtonTop}
              onPress={toggleMenu}
              activeOpacity={0.9}
            >
              <X size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          
          <ScrollView 
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.menuContainer}>
              {fabMenuItems.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.menuItem}
                  onPress={() => handleMenuPress(item.route)}
                  activeOpacity={0.8}
                >
                  <View style={styles.menuItemIcon}>
                    {item.icon}
                  </View>
                  <Text style={styles.menuItemText}>{item.title}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          
          <TouchableOpacity
            style={styles.closeButton}
            onPress={toggleMenu}
            activeOpacity={0.9}
          >
            <X size={24} color={Colors.background} />
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {!isOpen && isOnTabScreen && (
        <TouchableOpacity
          style={[styles.fab, { bottom: Math.max(insets.bottom + 16, 90) }]}
          onPress={toggleMenu}
          activeOpacity={0.9}
        >
          <Animated.View style={{ transform: [{ rotate: rotation }] }}>
            <Plus size={28} color={Colors.background} />
          </Animated.View>
        </TouchableOpacity>
      )}
    </>
  );
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ITEM_WIDTH = (SCREEN_WIDTH - 60) / 3;

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 90,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 1000,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    paddingTop: 60,
    paddingBottom: 30,
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  closeButtonTop: {
    position: 'absolute',
    right: 20,
    padding: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  menuContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  menuItem: {
    width: ITEM_WIDTH,
    alignItems: 'center',
    backgroundColor: Colors.card,
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderRadius: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 5,
  },
  menuItemIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  menuItemText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.text,
    textAlign: 'center',
  },
  menuTitle: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  closeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF4757',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 30,
    marginHorizontal: 20,
    marginTop: 10,
    gap: 8,
  },
  closeText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.background,
  },
});
