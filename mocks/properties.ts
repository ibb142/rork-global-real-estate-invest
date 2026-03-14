import { Property } from '@/types';

export const properties: Property[] = [];

export const getPropertyById = (id: string): Property | undefined => {
  return properties.find(p => p.id === id);
};

export const getLiveProperties = (): Property[] => {
  return properties.filter(p => p.status === 'live');
};

export const getFundedProperties = (): Property[] => {
  return properties.filter(p => p.status === 'funded');
};

export const getComingSoonProperties = (): Property[] => {
  return properties.filter(p => p.status === 'coming_soon');
};
