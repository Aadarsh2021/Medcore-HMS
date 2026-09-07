/**
 * MedCore HMS — Centralized API Client
 *
 * Provides typed HTTP communication with the NestJS API backend.
 * Automatically injects Supabase session Bearer tokens and Super Admin
 * tenant override headers (X-Hospital-Id).
 */

import { useAuthStore } from '../../stores/authStore';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export interface ApiRequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
  hospitalOverrideId?: string | null;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
  };
}

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public rawError?: any,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isUnauthorized(): boolean {
    return this.statusCode === 401;
  }

  get isForbidden(): boolean {
    return this.statusCode === 403;
  }

  get isNotFound(): boolean {
    return this.statusCode === 404;
  }

  get isConflict(): boolean {
    return this.statusCode === 409;
  }

  get isValidationError(): boolean {
    return this.statusCode === 422 || this.statusCode === 400;
  }

  get isRateLimited(): boolean {
    return this.statusCode === 429;
  }

  get isNetworkError(): boolean {
    return this.statusCode === 0;
  }
}

export async function apiClient<T = any>(
  endpoint: string,
  options: ApiRequestOptions = {},
): Promise<ApiResponse<T>> {
  const { params, hospitalOverrideId, headers: customHeaders, ...fetchOptions } = options;

  let url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        searchParams.append(key, String(val));
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += (url.includes('?') ? '&' : '?') + queryString;
    }
  }

  const headers = new Headers(customHeaders || {});

  if (!headers.has('Content-Type') && !(fetchOptions.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // Inject Supabase session access token
  const authState = useAuthStore.getState();
  const token = authState.session?.access_token;
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Inject Super Admin tenant override if active
  const activeHospitalOverride = hospitalOverrideId || (authState.user?.role === 'SUPER_ADMIN' ? authState.user.hospitalId : null);
  if (activeHospitalOverride && !headers.has('X-Hospital-Id')) {
    headers.set('X-Hospital-Id', activeHospitalOverride);
  }

  try {
    const res = await fetch(url, {
      ...fetchOptions,
      headers,
    });

    if (res.status === 204) {
      return { success: true };
    }

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      const errorMessage =
        json?.message ||
        (Array.isArray(json?.messages) ? json.messages.join(', ') : null) ||
        `Request failed with status ${res.status}`;
      throw new ApiError(res.status, errorMessage, json);
    }

    return json;
  } catch (err: any) {
    if (err instanceof ApiError) {
      throw err;
    }
    // Network or offline error
    throw new ApiError(0, err.message || 'Network connection failed. Backend service may be offline.', err);
  }
}
