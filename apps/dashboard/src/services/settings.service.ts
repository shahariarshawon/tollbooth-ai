import type { AllSettings } from '@/types/api';
import { http } from './api-client';

export const settingsService = {
  getAll: async (): Promise<AllSettings> =>
    (await http.get<AllSettings>('/settings')).data,

  updateSection: async <T>(category: string, value: Partial<T>): Promise<T> =>
    (await http.patch<T>(`/settings/${category.toLowerCase()}`, value)).data,
};
