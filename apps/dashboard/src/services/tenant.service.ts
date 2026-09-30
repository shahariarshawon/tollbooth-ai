import type { Page, PageParams, Tenant, TenantPlan } from '@/types/api';
import { http } from './api-client';

export interface CreateTenantInput {
  companyName: string;
  slug: string;
  plan?: TenantPlan;
}

export interface UpdateTenantInput {
  companyName?: string;
  plan?: TenantPlan;
  status?: 'ACTIVE' | 'SUSPENDED';
}

export const tenantService = {
  list: async (params: PageParams = {}): Promise<Page<Tenant>> =>
    (await http.get<Page<Tenant>>('/tenants', { params })).data,

  get: async (id: string): Promise<Tenant> => (await http.get<Tenant>(`/tenants/${id}`)).data,

  create: async (input: CreateTenantInput): Promise<Tenant> =>
    (await http.post<Tenant>('/tenants', input)).data,

  update: async (id: string, input: UpdateTenantInput): Promise<Tenant> =>
    (await http.patch<Tenant>(`/tenants/${id}`, input)).data,

  remove: async (id: string): Promise<void> => {
    await http.delete(`/tenants/${id}`);
  },
};
