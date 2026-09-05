import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { SupabaseService } from './supabase.service';
import { AuthSessionUser, UserRole } from '@medcore/types';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseService: SupabaseService,
  ) {}

  /**
   * Transforms internal Prisma User entity to standard AuthSessionUser
   */
  formatSessionUser(user: any): AuthSessionUser {
    return {
      id: user.id,
      email: user.email,
      role: user.role as UserRole,
      hospitalId: user.hospitalId,
      hospitalName: user.hospital?.name || (user.role === UserRole.SUPER_ADMIN ? 'MedCore Global HQ' : undefined),
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone || undefined,
      avatarUrl: user.avatarUrl || undefined,
    };
  }

  /**
   * Retrieves full profile of the currently authenticated user
   */
  async getMe(userId: string): Promise<{ user: AuthSessionUser; details: any }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        hospital: {
          select: {
            id: true,
            name: true,
            slug: true,
            code: true,
            status: true,
            subscriptionTier: true,
          },
        },
        doctorProfile: {
          include: {
            department: true,
          },
        },
        patientProfile: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    return {
      user: this.formatSessionUser(user),
      details: {
        doctorProfile: user.doctorProfile,
        patientProfile: user.patientProfile,
        hospital: user.hospital,
        isEmailVerified: user.isEmailVerified,
      },
    };
  }

  /**
   * Returns list of configured demo accounts for instant 1-click testing
   */
  async getDemoAccounts() {
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
      },
      select: {
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        hospital: {
          select: {
            name: true,
            code: true,
          },
        },
      },
      orderBy: {
        role: 'asc',
      },
    });

    return users.map((u) => ({
      email: u.email,
      role: u.role,
      name: `${u.firstName} ${u.lastName}`,
      hospitalName: u.hospital?.name || 'Global Platform',
      defaultPassword: 'Password123!',
    }));
  }

  /**
   * Automatically provisions demo accounts in Supabase Auth and links their UUIDs to Prisma DB
   */
  async seedDemoUsersToSupabase(): Promise<{ created: number; linked: number; errors: string[] }> {
    let created = 0;
    let linked = 0;
    const errors: string[] = [];

    const dbUsers = await this.prisma.user.findMany({
      where: { isActive: true },
    });

    let supabaseUsers: any[] = [];
    try {
      const { data, error } = await this.supabaseService.adminClient.auth.admin.listUsers();
      if (!error && data?.users) {
        supabaseUsers = data.users;
      }
    } catch (err: any) {
      this.logger.error(`Failed to list Supabase users: ${err.message}`);
    }

    for (const dbUser of dbUsers) {
      const email = dbUser.email.toLowerCase();
      let sbUser = supabaseUsers.find((u) => u.email?.toLowerCase() === email);

      if (!sbUser) {
        try {
          const { data, error } = await this.supabaseService.adminClient.auth.admin.createUser({
            email,
            password: 'Password123!',
            email_confirm: true,
            user_metadata: {
              firstName: dbUser.firstName,
              lastName: dbUser.lastName,
              role: dbUser.role,
              hospitalId: dbUser.hospitalId,
            },
          });

          if (error) {
            errors.push(`Failed to create ${email}: ${error.message}`);
            continue;
          }

          sbUser = data.user;
          created++;
        } catch (err: any) {
          errors.push(`Error creating ${email}: ${err.message}`);
          continue;
        }
      }

      if (sbUser && dbUser.supabaseAuthId !== sbUser.id) {
        await this.prisma.user.update({
          where: { id: dbUser.id },
          data: {
            supabaseAuthId: sbUser.id,
            isEmailVerified: true,
          },
        });
        linked++;
      }
    }

    return { created, linked, errors };
  }
}
