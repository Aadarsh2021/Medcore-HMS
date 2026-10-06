import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { randomUUID } from 'crypto';

@Injectable()
export class CorrelationLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();

    // 1. Establish or extract request correlation ID
    const correlationId =
      (req.headers['x-correlation-id'] as string) ||
      (req.headers['x-request-id'] as string) ||
      randomUUID();

    req.correlationId = correlationId;
    res.setHeader('x-correlation-id', correlationId);

    const startTime = Date.now();
    const method = req.method;
    const url = req.originalUrl || req.url;
    const tenantId = req.headers['x-hospital-id'] || req.user?.hospitalId || 'unscoped';
    const userId = req.user?.id || 'anonymous';

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          const statusCode = res.statusCode;
          this.logger.log(
            `[${correlationId}] ${method} ${url} ${statusCode} +${duration}ms - tenant:${tenantId} user:${userId}`,
          );
        },
        error: (error: any) => {
          const duration = Date.now() - startTime;
          const statusCode = error?.status || error?.statusCode || 500;
          this.logger.error(
            `[${correlationId}] ${method} ${url} ${statusCode} +${duration}ms - tenant:${tenantId} user:${userId} | Error: ${error.message}`,
            error.stack,
          );
        },
      }),
    );
  }
}
