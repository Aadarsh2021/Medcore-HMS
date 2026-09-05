import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient, User as SupabaseUser } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private readonly logger = new Logger(SupabaseService.name);
  private readonly supabaseAdmin: SupabaseClient | null = null;
  private readonly supabaseAnon: SupabaseClient | null = null;

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl =
      this.configService.get<string>('SUPABASE_URL') ||
      this.configService.get<string>('NEXT_PUBLIC_SUPABASE_URL') ||
      '';
    const serviceRoleKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY') || '';
    const anonKey =
      this.configService.get<string>('SUPABASE_ANON_KEY') ||
      this.configService.get<string>('NEXT_PUBLIC_SUPABASE_ANON_KEY') ||
      '';

    if (supabaseUrl && serviceRoleKey) {
      this.supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
      this.logger.log('Supabase Admin Client initialized successfully.');
    } else {
      this.logger.warn('Supabase URL or Service Role Key missing. Admin features will be limited.');
    }

    if (supabaseUrl && anonKey) {
      this.supabaseAnon = createClient(supabaseUrl, anonKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
      this.logger.log('Supabase Public Client initialized.');
    }
  }

  get adminClient(): SupabaseClient {
    if (!this.supabaseAdmin) {
      throw new Error('Supabase admin client not initialized. Check SUPABASE_SERVICE_ROLE_KEY.');
    }
    return this.supabaseAdmin;
  }

  get anonClient(): SupabaseClient {
    if (!this.supabaseAnon) {
      throw new Error('Supabase client not initialized. Check SUPABASE_ANON_KEY.');
    }
    return this.supabaseAnon;
  }

  /**
   * Validates an access token and returns the Supabase User
   */
  async verifyAccessToken(token: string): Promise<SupabaseUser | null> {
    try {
      const client = this.supabaseAdmin || this.supabaseAnon;
      if (!client) {
        throw new Error('Supabase client unavailable');
      }

      const { data, error } = await client.auth.getUser(token);
      if (error || !data.user) {
        this.logger.debug(`Token verification failed: ${error?.message || 'No user returned'}`);
        return null;
      }

      return data.user;
    } catch (err: any) {
      this.logger.error(`Error verifying Supabase token: ${err.message}`);
      return null;
    }
  }
}
