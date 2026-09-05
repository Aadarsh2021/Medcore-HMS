import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SupabaseService } from '../supabase.service';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(SupabaseAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly supabaseService: SupabaseService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Bearer authentication token');
    }

    const token = authHeader.split(' ')[1];
    const supabaseUser = await this.supabaseService.verifyAccessToken(token);

    if (!supabaseUser) {
      throw new UnauthorizedException('Invalid or expired authentication session');
    }

    // Resolve user from Prisma database
    let dbUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { supabaseAuthId: supabaseUser.id },
          ...(supabaseUser.email ? [{ email: supabaseUser.email.toLowerCase() }] : []),
        ],
      },
      include: {
        hospital: {
          select: {
            id: true,
            name: true,
            slug: true,
            code: true,
            status: true,
          },
        },
        doctorProfile: {
          select: {
            id: true,
            licenseNumber: true,
            specialization: true,
            departmentId: true,
          },
        },
        patientProfile: {
          select: {
            id: true,
            uhid: true,
            gender: true,
            bloodGroup: true,
          },
        },
      },
    });

    if (!dbUser) {
      this.logger.warn(`Supabase user ${supabaseUser.email} has no corresponding profile in MedCore DB.`);
      throw new UnauthorizedException('User profile not found in MedCore Hospital system');
    }

    // Auto-link Supabase UID if not yet linked
    if (!dbUser.supabaseAuthId && supabaseUser.id) {
      dbUser = await this.prisma.user.update({
        where: { id: dbUser.id },
        data: { supabaseAuthId: supabaseUser.id },
        include: {
          hospital: {
            select: {
              id: true,
              name: true,
              slug: true,
              code: true,
              status: true,
            },
          },
          doctorProfile: {
            select: {
              id: true,
              licenseNumber: true,
              specialization: true,
              departmentId: true,
            },
          },
          patientProfile: {
            select: {
              id: true,
              uhid: true,
              gender: true,
              bloodGroup: true,
            },
          },
        },
      });
    }

    if (!dbUser.isActive) {
      throw new ForbiddenException('Your account has been deactivated. Please contact hospital administrator.');
    }

    // Set user and tenant scope on request
    request.user = dbUser;
    request.hospitalId = dbUser.hospitalId;

    return true;
  }
}
