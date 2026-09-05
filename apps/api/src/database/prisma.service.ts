import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createTenantExtension } from './prisma-tenant.extension';
import { runWithTenantContext, runWithSystemContext, TenantContext } from './tenant-context';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly extended: any;

  constructor() {
    const rawUrl = process.env.DATABASE_URL || '';
    const dbUrl = rawUrl.includes('connection_limit')
      ? rawUrl
      : rawUrl
        ? rawUrl + (rawUrl.includes('?') ? '&' : '?') + 'connection_limit=10'
        : undefined;

    super({
      datasources: dbUrl ? { db: { url: dbUrl } } : undefined,
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'info' },
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
    });


    this.extended = this.$extends(createTenantExtension(this));

    return new Proxy(this, {
      get(target: any, prop: string | symbol, receiver: any) {
        if (prop === 'raw') {
          return target;
        }
        if (prop in target.extended) {
          const value = target.extended[prop];
          if (typeof value === 'function') {
            return value.bind(target.extended);
          }
          return value;
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  }

  get raw(): PrismaClient {
    return this;
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Successfully connected to PostgreSQL database via Prisma.');
    } catch (error) {
      this.logger.error('Failed to connect to PostgreSQL database:', error);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Disconnected from PostgreSQL database.');
  }

  /**
   * Helper to execute queries explicitly within a given tenant context
   */
  async withTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    return runWithTenantContext({ tenantId }, fn);
  }

  /**
   * Helper to execute queries in unconstrained system mode (bypassing tenant filter)
   */
  async withSystem<T>(fn: () => Promise<T>): Promise<T> {
    return runWithSystemContext(fn);
  }

  /**
   * Helper to execute queries with custom TenantContext
   */
  async withTenantContext<T>(context: TenantContext, fn: () => Promise<T>): Promise<T> {
    return runWithTenantContext(context, fn);
  }
}

