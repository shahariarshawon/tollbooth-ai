/**
 * The tenant a SUPER_ADMIN is currently working inside. Tenant users never use this: the control
 * plane ignores (and rejects) it for them. Kept outside React so the API client can read it, and
 * exposed through useSyncExternalStore in hooks/use-tenant-scope.ts.
 */
const STORAGE_KEY = 'tollbooth.tenantScope';
const listeners = new Set<() => void>();
let current: string | null = null;
let loaded = false;

function load(): void {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;
  try {
    current = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    current = null;
  }
}

export function getTenantScope(): string | null {
  load();
  return current;
}

export function setTenantScope(tenantId: string | null): void {
  load();
  current = tenantId;
  try {
    if (tenantId) window.localStorage.setItem(STORAGE_KEY, tenantId);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable (private mode); the in-memory value still works for this tab.
  }
  listeners.forEach((listener) => listener());
}

export function subscribeTenantScope(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
