const tintColorLight = '#FFD700';

type ColorScheme = {
  text: string;
  background: string;
  tint: string;
  tabIconDefault: string;
  tabIconSelected: string;
};

type AppColors = {
  light: ColorScheme;
  dark: ColorScheme;
  primary: string;
  primaryDark: string;
  primaryLight: string;
  secondary: string;
  accent: string;
  background: string;
  backgroundSecondary: string;
  backgroundTertiary: string;
  surface: string;
  surfaceElevated: string;
  surfaceLight: string;
  surfaceBorder: string;
  border: string;
  card: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  muted: string;
  inputPlaceholder: string;
  inputBackground: string;
  inputBorder: string;
  white: string;
  black: string;
  success: string;
  positive: string;
  warning: string;
  error: string;
  danger: string;
  negative: string;
  info: string;
  gold: string;
  green: string;
  chartGreen: string;
  red: string;
  chartRed: string;
  orange: string;
  blue: string;
  overlay: string;
  transparent: string;
};

const Colors: AppColors = {
  light: {
    text: '#FFFFFF',
    background: '#000000',
    tint: tintColorLight,
    tabIconDefault: '#666666',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#FFFFFF',
    background: '#000000',
    tint: tintColorLight,
    tabIconDefault: '#666666',
    tabIconSelected: tintColorLight,
  },
  primary: '#FFD700',
  primaryDark: '#E6C200',
  primaryLight: '#FFF2A3',
  secondary: '#1A1A1A',
  accent: '#FFD700',
  background: '#000000',
  backgroundSecondary: '#1A1A1A',
  backgroundTertiary: '#242424',
  surface: '#141414',
  surfaceElevated: '#1A1A1A',
  surfaceLight: '#2A2A2A',
  surfaceBorder: '#2A2A2A',
  border: '#2A2A2A',
  card: '#141414',
  text: '#FFFFFF',
  textSecondary: '#999999',
  textTertiary: '#666666',
  muted: '#666666',
  inputPlaceholder: '#666666',
  inputBackground: '#1A1A1A',
  inputBorder: '#333333',
  white: '#FFFFFF',
  black: '#000000',
  success: '#22C55E',
  positive: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
  danger: '#EF4444',
  negative: '#EF4444',
  info: '#3B82F6',
  gold: '#FFD700',
  green: '#22C55E',
  chartGreen: '#22C55E',
  red: '#EF4444',
  chartRed: '#EF4444',
  orange: '#F59E0B',
  blue: '#3B82F6',
  overlay: 'rgba(0,0,0,0.7)',
  transparent: 'transparent',
};

export default Colors;
