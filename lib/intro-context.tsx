import { useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import createContextHook from '@nkzw/create-context-hook';

export interface OnboardingFeature {
  id: string;
  text: string;
}

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  iconType: string;
  features: OnboardingFeature[];
  imageUrl: string;
  gradientStart: string;
  gradientEnd: string;
  isActive: boolean;
  order: number;
}

const STORAGE_KEY = 'ipx_intro_steps';
const ONBOARDING_COMPLETED_KEY = 'ipx_onboarding_completed';

const DEFAULT_STEPS: OnboardingStep[] = [
  {
    id: '1',
    title: 'Welcome to IVX HOLDINGS',
    description: 'Your gateway to fractional real estate investing. Start building your property portfolio from just $1.',
    iconType: 'sparkles',
    features: [
      { id: 'f1', text: 'Invest in premium properties worldwide' },
      { id: 'f2', text: 'Start with as little as $1' },
      { id: 'f3', text: 'Earn rental income & appreciation' },
      { id: 'f4', text: 'Trade shares 24/7' },
    ],
    imageUrl: '',
    gradientStart: '#D4AF37',
    gradientEnd: '#FFD700',
    isActive: true,
    order: 0,
  },
  {
    id: '2',
    title: 'Discover Properties',
    description: 'Browse and search through our curated selection of premium real estate investments.',
    iconType: 'home',
    features: [
      { id: 'f1', text: 'Search by location or property type' },
      { id: 'f2', text: 'Filter: Live, Coming Soon, Funded' },
      { id: 'f3', text: 'View featured investments' },
      { id: 'f4', text: 'Get real-time notifications' },
    ],
    imageUrl: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=400',
    gradientStart: '#D4AF37',
    gradientEnd: '#3B82F6',
    isActive: true,
    order: 1,
  },
  {
    id: '3',
    title: 'IVXHOLDINGS Investments',
    description: 'Access exclusive property investments with professional management and monthly dividends.',
    iconType: 'building',
    features: [
      { id: 'f1', text: 'Hand-picked premium properties' },
      { id: 'f2', text: 'Monthly rental distributions' },
      { id: 'f3', text: 'Property appreciation gains' },
      { id: 'f4', text: 'Submit your own property' },
    ],
    imageUrl: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=400',
    gradientStart: '#22C55E',
    gradientEnd: '#D4AF37',
    isActive: true,
    order: 2,
  },
  {
    id: '4',
    title: '24/7 Trading Market',
    description: 'Buy and sell property shares anytime with real-time pricing and instant execution.',
    iconType: 'trending',
    features: [
      { id: 'f1', text: 'Real-time price updates' },
      { id: 'f2', text: 'Instant buy/sell execution' },
      { id: 'f3', text: 'View order book depth' },
      { id: 'f4', text: 'Track gainers & losers' },
    ],
    imageUrl: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400',
    gradientStart: '#3B82F6',
    gradientEnd: '#D4AF37',
    isActive: true,
    order: 3,
  },
  {
    id: '5',
    title: 'Track Your Portfolio',
    description: 'Monitor your investments, manage your wallet, and track your returns all in one place.',
    iconType: 'briefcase',
    features: [
      { id: 'f1', text: 'Total portfolio value & P&L' },
      { id: 'f2', text: 'Holdings breakdown' },
      { id: 'f3', text: 'Transaction history' },
      { id: 'f4', text: 'Add funds & withdraw easily' },
    ],
    imageUrl: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400',
    gradientStart: '#F59E0B',
    gradientEnd: '#D4AF37',
    isActive: true,
    order: 4,
  },
  {
    id: '6',
    title: 'Your Account',
    description: 'Complete verification, manage payments, and customize your experience.',
    iconType: 'user',
    features: [
      { id: 'f1', text: 'Quick identity verification' },
      { id: 'f2', text: 'Multiple payment methods' },
      { id: 'f3', text: 'Tax documents & statements' },
      { id: 'f4', text: 'Refer friends, earn $50' },
    ],
    imageUrl: 'https://images.unsplash.com/photo-1553729459-efe14ef6055d?w=400',
    gradientStart: '#6B7280',
    gradientEnd: '#D4AF37',
    isActive: true,
    order: 5,
  },
  {
    id: '7',
    title: "You're All Set!",
    description: 'Start your real estate investment journey today. Your first investment is just a tap away.',
    iconType: 'zap',
    features: [
      { id: 'f1', text: 'Browse available properties' },
      { id: 'f2', text: 'Add funds to your wallet' },
      { id: 'f3', text: 'Make your first investment' },
      { id: 'f4', text: 'Join 10,000+ investors' },
    ],
    imageUrl: '',
    gradientStart: '#22C55E',
    gradientEnd: '#D4AF37',
    isActive: true,
    order: 6,
  },
];

export const [IntroProvider, useIntro] = createContextHook(() => {
  const [steps, setSteps] = useState<OnboardingStep[]>(DEFAULT_STEPS);
  const [isLoading, setIsLoading] = useState(true);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(true);

  useEffect(() => {
    loadSteps();
    checkOnboardingStatus();
  }, []);

  const loadSteps = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setSteps(parsed);
        console.log('[IntroContext] Loaded steps from storage:', parsed.length);
      }
    } catch (error) {
      console.error('[IntroContext] Error loading steps:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const checkOnboardingStatus = async () => {
    try {
      const completed = await AsyncStorage.getItem(ONBOARDING_COMPLETED_KEY);
      setHasCompletedOnboarding(completed === 'true');
    } catch (error) {
      console.error('[IntroContext] Error checking onboarding status:', error);
    }
  };

  const saveSteps = useCallback(async (newSteps: OnboardingStep[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newSteps));
      setSteps(newSteps);
      console.log('[IntroContext] Saved steps:', newSteps.length);
    } catch (error) {
      console.error('[IntroContext] Error saving steps:', error);
    }
  }, []);

  const addStep = useCallback((step: OnboardingStep) => {
    const newSteps = [...steps, { ...step, order: steps.length }];
    saveSteps(newSteps);
  }, [steps, saveSteps]);

  const updateStep = useCallback((stepId: string, updates: Partial<OnboardingStep>) => {
    const newSteps = steps.map(s => 
      s.id === stepId ? { ...s, ...updates } : s
    );
    saveSteps(newSteps);
  }, [steps, saveSteps]);

  const deleteStep = useCallback((stepId: string) => {
    const newSteps = steps
      .filter(s => s.id !== stepId)
      .map((s, index) => ({ ...s, order: index }));
    saveSteps(newSteps);
  }, [steps, saveSteps]);

  const reorderSteps = useCallback((fromIndex: number, toIndex: number) => {
    const newSteps = [...steps];
    const [removed] = newSteps.splice(fromIndex, 1);
    newSteps.splice(toIndex, 0, removed);
    const reordered = newSteps.map((s, index) => ({ ...s, order: index }));
    saveSteps(reordered);
  }, [steps, saveSteps]);

  const moveStep = useCallback((stepId: string, direction: 'up' | 'down') => {
    const index = steps.findIndex(s => s.id === stepId);
    if (index === -1) return;
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= steps.length) return;
    reorderSteps(index, newIndex);
  }, [steps, reorderSteps]);

  const toggleStepActive = useCallback((stepId: string) => {
    const newSteps = steps.map(s => 
      s.id === stepId ? { ...s, isActive: !s.isActive } : s
    );
    saveSteps(newSteps);
  }, [steps, saveSteps]);

  const duplicateStep = useCallback((stepId: string) => {
    const step = steps.find(s => s.id === stepId);
    if (!step) return;
    const newStep: OnboardingStep = {
      ...step,
      id: Date.now().toString(),
      title: `${step.title} (Copy)`,
      order: steps.length,
      features: step.features.map(f => ({ ...f, id: `${Date.now()}_${f.id}` })),
    };
    addStep(newStep);
  }, [steps, addStep]);

  const resetToDefaults = useCallback(async () => {
    await saveSteps(DEFAULT_STEPS);
  }, [saveSteps]);

  const completeOnboarding = useCallback(async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
      setHasCompletedOnboarding(true);
    } catch (error) {
      console.error('[IntroContext] Error completing onboarding:', error);
    }
  }, []);

  const resetOnboarding = useCallback(async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_COMPLETED_KEY, 'false');
      setHasCompletedOnboarding(false);
    } catch (error) {
      console.error('[IntroContext] Error resetting onboarding:', error);
    }
  }, []);

  const activeSteps = useMemo(() => 
    steps.filter(s => s.isActive).sort((a, b) => a.order - b.order),
    [steps]
  );

  return {
    steps,
    activeSteps,
    isLoading,
    hasCompletedOnboarding,
    saveSteps,
    addStep,
    updateStep,
    deleteStep,
    reorderSteps,
    moveStep,
    toggleStepActive,
    duplicateStep,
    resetToDefaults,
    completeOnboarding,
    resetOnboarding,
  };
});
