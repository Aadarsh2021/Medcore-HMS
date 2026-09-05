import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tenantStorage, TenantContext } from '../../database/tenant-context';

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const hospitalId = request.hospitalId ?? null;

    const tenantContext: TenantContext = {
      tenantId: hospitalId,
      userId: user?.id,
      role: user?.role,
      isSuperAdmin: user?.role === 'SUPER_ADMIN',
      bypassTenant: !user && !hospitalId,
    };

    return new Observable((subscriber) => {
      tenantStorage.run(tenantContext, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}
