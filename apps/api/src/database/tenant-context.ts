import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantContext {
  tenantId: string | null;
  userId?: string;
  role?: string;
  isSuperAdmin?: boolean;
  bypassTenant?: boolean;
}

export const tenantStorage = new AsyncLocalStorage<TenantContext>();

/**
 * Retrieves the current request's tenant context from AsyncLocalStorage.
 */
export function getTenantContext(): TenantContext | undefined {
  return tenantStorage.getStore();
}

/**
 * Retrieves the active effective hospital/tenant ID.
 * Returns null if running in system mode or unconstrained super admin.
 */
export function getEffectiveTenantId(): string | null {
  const store = tenantStorage.getStore();
  if (!store || store.bypassTenant) {
    return null;
  }
  return store.tenantId;
}

/**
 * Runs a function within a specific tenant context.
 * Useful for background jobs, testing, and explicit tenant scoping.
 */
export function runWithTenantContext<T>(
  context: TenantContext,
  fn: () => T | Promise<T>,
): Promise<T> {
  return tenantStorage.run(context, () => Promise.resolve(fn()));
}

/**
 * Runs a function with tenant filtering bypassed (system/administrative mode).
 */
export function runWithSystemContext<T>(fn: () => T | Promise<T>): Promise<T> {
  return tenantStorage.run({ tenantId: null, bypassTenant: true }, () =>
    Promise.resolve(fn()),
  );
}
