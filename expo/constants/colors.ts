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
  subtitle: string;
  tint: string;
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
    tabIconDefault: '#555555',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#FFFFFF',
    background: '#000000',
    tint: tintColorLight,
    tabIconDefault: '#555555',
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
  textSecondary: '#909090',
  textTertiary: '#555555',
  subtitle: '#909090',
  tint: tintColorLight,
  muted: '#555555',
  inputPlaceholder: '#555555',
  inputBackground: '#1A1A1A',
  inputBorder: '#333333',
  white: '#FFFFFF',
  black: '#000000',
  success: '#00C48C',
  positive: '#00C48C',
  warning: '#F59E0B',
  error: '#FF4D4D',
  danger: '#FF4D4D',
  negative: '#FF4D4D',
  info: '#4A90D9',
  gold: '#FFD700',
  green: '#00C48C',
  chartGreen: '#00C48C',
  red: '#FF4D4D',
  chartRed: '#FF4D4D',
  orange: '#F59E0B',
  blue: '#4A90D9',
  overlay: 'rgba(0,0,0,0.7)',
  transparent: 'transparent',
};

export default Colors;
