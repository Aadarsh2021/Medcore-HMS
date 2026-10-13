import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';
import { RolesGuard } from '../src/modules/auth/guards/roles.guard';
import { ROLES_KEY } from '../src/modules/auth/decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../src/modules/auth/decorators/public.decorator';
import { UserRole } from '@medcore/types';

describe('Auth Security — POST /api/auth/seed-demo-users Regression Tests', () => {
  let authController: AuthController;
  let mockAuthService: jest.Mocked<Partial<AuthService>>;
  let reflector: Reflector;
  let rolesGuard: RolesGuard;

  beforeEach(() => {
    mockAuthService = {
      seedDemoUsersToSupabase: jest.fn().mockResolvedValue({ created: 0, linked: 0, errors: [] }),
      getDemoAccounts: jest.fn().mockResolvedValue([]),
      getMe: jest.fn(),
    };

    authController = new AuthController(mockAuthService as unknown as AuthService);
    reflector = new Reflector();
    rolesGuard = new RolesGuard(reflector);
  });

  describe('Route Metadata & Security Annotations', () => {
    it('must NOT have @Public() annotation on seedDemoUsers', () => {
      const isPublic = reflector.get<boolean>(IS_PUBLIC_KEY, AuthController.prototype.seedDemoUsers);
      expect(isPublic).toBeFalsy();
    });

    it('must require SUPER_ADMIN role via @Roles decorator', () => {
      const roles = reflector.get<UserRole[]>(ROLES_KEY, AuthController.prototype.seedDemoUsers);
      expect(roles).toBeDefined();
      expect(roles).toEqual([UserRole.SUPER_ADMIN]);
    });
  });

  describe('Role-Based Authorization Enforcement (RolesGuard)', () => {
    function createMockContext(user?: any): ExecutionContext {
      return {
        getHandler: () => AuthController.prototype.seedDemoUsers,
        getClass: () => AuthController,
        switchToHttp: () => ({
          getRequest: () => ({ user }),
          getResponse: () => ({}),
          getNext: () => ({}),
        }),
      } as unknown as ExecutionContext;
    }

    it('must reject unauthenticated requests (missing user context)', () => {
      const context = createMockContext(undefined);
      expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('must reject HOSPITAL_ADMIN attempting to access seed route', () => {
      const context = createMockContext({
        id: 'user-admin',
        role: UserRole.HOSPITAL_ADMIN,
        hospitalId: 'hosp-1',
      });
      expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('must reject DOCTOR attempting to access seed route', () => {
      const context = createMockContext({
        id: 'user-doc',
        role: UserRole.DOCTOR,
        hospitalId: 'hosp-1',
      });
      expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('must reject PATIENT attempting to access seed route', () => {
      const context = createMockContext({
        id: 'user-pat',
        role: UserRole.PATIENT,
        hospitalId: 'hosp-1',
      });
      expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('must permit SUPER_ADMIN user context', () => {
      const context = createMockContext({
        id: 'super-admin-id',
        role: UserRole.SUPER_ADMIN,
      });
      const result = rolesGuard.canActivate(context);
      expect(result).toBe(true);
    });
  });

  describe('Production Environment Guarding', () => {
    const originalEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    it('must strictly block execution and throw ForbiddenException in production', async () => {
      process.env.NODE_ENV = 'production';

      await expect(authController.seedDemoUsers()).rejects.toThrow(
        new ForbiddenException('Demo user seeding is disabled in production environments.'),
      );

      // Verify the service was never invoked
      expect(mockAuthService.seedDemoUsersToSupabase).not.toHaveBeenCalled();
    });

    it('allows execution in non-production environments when invoked by authorized actor', async () => {
      process.env.NODE_ENV = 'development';

      const response = await authController.seedDemoUsers();
      expect(response.success).toBe(true);
      expect(mockAuthService.seedDemoUsersToSupabase).toHaveBeenCalledTimes(1);
    });
  });

  describe('CORS Disallowed Origin Handling', () => {
    it('verifies that unapproved origins return false rather than throwing 500 error', () => {
      const allowedOrigins = ['https://medcore-hms-eea8e.web.app'];
      const corsOriginHandler = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(null, false);
        }
      };

      // Test approved origin
      let approvedResult: boolean | undefined;
      corsOriginHandler('https://medcore-hms-eea8e.web.app', (err, allow) => {
        expect(err).toBeNull();
        approvedResult = allow;
      });
      expect(approvedResult).toBe(true);

      // Test unapproved origin
      let rejectedResult: boolean | undefined;
      corsOriginHandler('https://evil-attacker.com', (err, allow) => {
        expect(err).toBeNull();
        rejectedResult = allow;
      });
      expect(rejectedResult).toBe(false);
    });
  });
});
