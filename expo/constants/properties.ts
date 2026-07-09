import { Property } from '@/types';

export const properties: Property[] = [];

export const getPropertyById = (id: string): Property | undefined => {
  return properties.find((p) => p.id === id);
};
