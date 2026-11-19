const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat('en-US');
const dateFormat = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

export const formatCompactNumber = (value: number): string => compact.format(value);
export const formatNumber = (value: number): string => integer.format(value);

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '-' : dateFormat.format(date);
}

export function initials(firstName?: string | null, lastName?: string | null): string {
  const f = firstName?.trim() || '';
  const l = lastName?.trim() || '';
  if (f && l) return `${f.charAt(0)}${l.charAt(0)}`.toUpperCase();
  if (f) return f.charAt(0).toUpperCase();
  if (l) return l.charAt(0).toUpperCase();
  return 'U';
}

export function fullName(user: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string;
}): string {
  const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  return name || user.email || 'User';
}

/** "TENANT_ADMIN" -> "Tenant admin" */
export function humanize(value: string): string {
  const text = value.toLowerCase().replaceAll('_', ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
