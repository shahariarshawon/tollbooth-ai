import type { AssignableRole } from '@/types/api';

export const ASSIGNABLE_ROLES: { value: AssignableRole; label: string; description: string }[] = [
  {
    value: 'TENANT_ADMIN',
    label: 'Tenant admin',
    description: 'Manages users, projects, keys and settings for the company.',
  },
  {
    value: 'DEVELOPER',
    label: 'Developer',
    description: 'Creates projects and API keys and sees usage.',
  },
  {
    value: 'FINANCE',
    label: 'Finance',
    description: 'Sees usage and billing. Cannot change anything.',
  },
];
