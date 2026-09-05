import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { UserRole } from '@medcore/types';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return true; // SupabaseAuthGuard handles unauthenticated requests
    }

    // SUPER_ADMIN can operate across all tenants, and optionally override via header
    if (user.role === UserRole.SUPER_ADMIN) {
      const overrideHeader = request.headers['x-hospital-id'];
      if (overrideHeader) {
        request.hospitalId = overrideHeader;
      }
      return true;
    }

    // Standard hospital staff / patients MUST have a valid hospitalId
    const targetHospitalId =
      request.params?.hospitalId ||
      request.query?.hospitalId ||
      request.body?.hospitalId;

    if (targetHospitalId && targetHospitalId !== user.hospitalId) {
      throw new ForbiddenException(
        'Cross-tenant violation: You do not have permission to access data belonging to another hospital facility.',
      );
    }

    // Ensure hospitalId is always pinned on the request
    request.hospitalId = user.hospitalId;

    return true;
  }
}
