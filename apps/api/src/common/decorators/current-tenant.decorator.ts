import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Extracts the verified effective hospitalId from the request object.
 * Set by SupabaseAuthGuard and TenantGuard.
 */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | null => {
    const request = ctx.switchToHttp().getRequest();
    return request.hospitalId ?? null;
  },
);
