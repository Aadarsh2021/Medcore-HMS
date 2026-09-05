import { Module, Global } from '@nestjs/common';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { SupabaseAuthGuard } from './guards/supabase-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { TenantGuard } from './guards/tenant.guard';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    SupabaseService,
    AuthService,
    SupabaseAuthGuard,
    RolesGuard,
    TenantGuard,
  ],
  exports: [
    SupabaseService,
    AuthService,
    SupabaseAuthGuard,
    RolesGuard,
    TenantGuard,
  ],
})
export class AuthModule {}
