export type ScreenSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export const getResponsiveSize = (width: number): ScreenSize => {
  if (width < 340) return 'xs';
  if (width < 375) return 'sm';
  if (width < 414) return 'md';
  if (width < 480) return 'lg';
  return 'xl';
};

export const isCompactScreen = (size: ScreenSize): boolean => {
  return size === 'xs' || size === 'sm';
};

export const isExtraSmallScreen = (size: ScreenSize): boolean => {
  return size === 'xs';
};
