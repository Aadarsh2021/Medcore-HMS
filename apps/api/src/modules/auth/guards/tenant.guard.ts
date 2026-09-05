import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { UserRole } from '@medcore/types';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return true; // SupabaseAuthGuard handles unauthenticated requests
    }

    // SUPER_ADMIN can operate across all tenants with an explicit target header
    if (user.role === UserRole.SUPER_ADMIN) {
      const overrideHeader = request.headers['x-hospital-id'] as string | undefined;
      if (overrideHeader) {
        // Validate target hospital exists and is active
        const targetHospital = await this.prisma.raw.hospital.findUnique({
          where: { id: overrideHeader },
          select: { id: true, status: true },
        });

        if (!targetHospital || targetHospital.status !== 'ACTIVE') {
          throw new ForbiddenException(
            `Invalid target hospital specified in X-Hospital-Id: Facility does not exist or is inactive.`,
          );
        }

        request.hospitalId = targetHospital.id;
      } else {
        request.hospitalId = null;
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

    // Ensure hospitalId is always pinned strictly from authenticated user profile
    request.hospitalId = user.hospitalId;

    return true;
  }
}

