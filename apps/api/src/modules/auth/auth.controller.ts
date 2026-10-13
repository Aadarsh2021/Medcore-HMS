import {
  Controller,
  Get,
  Post,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { SupabaseAuthGuard } from './guards/supabase-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { UserRole } from '@medcore/types';

@ApiTags('Authentication & Identity')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  @UseGuards(SupabaseAuthGuard)
  @ApiBearerAuth('bearer-token')
  @ApiOperation({ summary: 'Get current authenticated user profile & tenant context' })
  @ApiResponse({ status: 200, description: 'User profile retrieved successfully' })
  async getMe(@CurrentUser('id') userId: string) {
    const data = await this.authService.getMe(userId);
    return {
      success: true,
      data,
    };
  }

  @Public()
  @Get('demo-accounts')
  @ApiOperation({ summary: 'Get configured clinical & admin demo accounts' })
  async getDemoAccounts() {
    const data = await this.authService.getDemoAccounts();
    return {
      success: true,
      data,
    };
  }

  @Post('seed-demo-users')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBearerAuth('bearer-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Synchronize and provision seed users in Supabase Auth (Super Admin only, disabled in production)' })
  @ApiResponse({ status: 200, description: 'Seed users provisioned in Supabase Auth' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: Requires SUPER_ADMIN role and non-production environment' })
  async seedDemoUsers() {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Demo user seeding is disabled in production environments.');
    }
    const result = await this.authService.seedDemoUsersToSupabase();
    return {
      success: true,
      data: result,
      message: `Provisioned ${result.created} new accounts, linked ${result.linked} existing accounts in Supabase Auth.`,
    };
  }
}
