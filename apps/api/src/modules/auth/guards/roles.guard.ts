import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@medcore/types';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user || !user.role) {
      throw new ForbiddenException('Access denied: Unauthenticated or missing role');
    }

    // SUPER_ADMIN has global unrestricted access
    if (user.role === UserRole.SUPER_ADMIN) {
      return true;
    }

    const hasPermission = requiredRoles.includes(user.role as UserRole);

    if (!hasPermission) {
      throw new ForbiddenException(
        `Access denied: Action requires one of [${requiredRoles.join(', ')}], but your role is ${user.role}`,
      );
    }

    return true;
  }
}
