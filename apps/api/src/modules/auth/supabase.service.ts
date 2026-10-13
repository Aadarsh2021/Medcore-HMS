import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient, User as SupabaseUser } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private readonly logger = new Logger(SupabaseService.name);
  private supabaseAdmin: SupabaseClient | null = null;
  private supabaseAnon: SupabaseClient | null = null;

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

  private mockStore = new Map<string, any>();
  private mockTokenStore = new Map<string, any>();

  get adminClient(): SupabaseClient {
    if (!this.supabaseAdmin) {
      if (process.env.NODE_ENV === 'test') {
        this.supabaseAdmin = {
          auth: {
            getUser: async (token: string) => {
              const user = this.mockTokenStore.get(token) || Array.from(this.mockStore.values())[0] || null;
              return {
                data: { user: user || { id: 'mock-sb-uid', email: 'test@medcore.io', user_metadata: { role: 'DOCTOR' } } },
                error: null,
              };
            },
            admin: {
              createUser: async (params: any) => {
                const id = 'mock-sb-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
                const user = {
                  id,
                  email: params.email?.toLowerCase(),
                  user_metadata: params.user_metadata || {},
                };
                this.mockStore.set(id, user);
                this.mockStore.set(params.email?.toLowerCase(), user);
                return { data: { user }, error: null };
              },
              getUserById: async (id: string) => {
                const user = this.mockStore.get(id) || null;
                return {
                  data: { user },
                  error: user ? null : ({ message: 'User not found' } as any),
                };
              },
              deleteUser: async (id: string) => {
                this.mockStore.delete(id);
                return { data: {}, error: null };
              },
              listUsers: async () => {
                return { data: { users: Array.from(this.mockStore.values()) }, error: null };
              },
            },
          },
        } as any;
      } else {
        throw new Error('Supabase admin client not initialized. Check SUPABASE_SERVICE_ROLE_KEY.');
      }
    }
    return this.supabaseAdmin;
  }

  get anonClient(): SupabaseClient {
    if (!this.supabaseAnon) {
      if (process.env.NODE_ENV === 'test') {
        this.supabaseAnon = {
          auth: {
            signInWithPassword: async (creds: any) => {
              const email = creds.email?.toLowerCase();
              const user = this.mockStore.get(email) || { id: 'mock-sb-' + Date.now(), email, user_metadata: {} };
              const token = 'mock-jwt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
              this.mockTokenStore.set(token, user);
              return {
                data: {
                  session: {
                    access_token: token,
                    refresh_token: 'mock-refresh-token',
                  },
                  user,
                },
                error: null,
              };
            },
            getUser: async (token: string) => {
              const user = this.mockTokenStore.get(token) || Array.from(this.mockStore.values())[0];
              return {
                data: { user: user || { id: 'mock-sb-uid', email: 'test@medcore.io', user_metadata: {} } },
                error: null,
              };
            },
          },
        } as any;
      } else {
        throw new Error('Supabase client not initialized. Check SUPABASE_ANON_KEY.');
      }
    }
    return this.supabaseAnon;
  }

  /**
   * Validates an access token and returns the Supabase User
   */
  async verifyAccessToken(token: string): Promise<SupabaseUser | null> {
    try {
      const mockUser = this.mockTokenStore.get(token);
      if (mockUser) return mockUser as SupabaseUser;

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
