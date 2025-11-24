const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

interface RequestOptions extends RequestInit {
  data?: unknown;
}

class ApiClient {
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  private async request<T>(
    endpoint: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const { data, headers, ...customOptions } = options;

    const config: RequestInit = {
      ...customOptions,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    if (data) {
      config.body = JSON.stringify(data);
    }

    // Add timeout support (95 seconds for long-running calendar operations)
    const timeout = 95000; // 95 seconds
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    config.signal = controller.signal;

    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, config);
      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({
          message: 'An error occurred',
        }));
        throw new Error(error.message || 'Request failed');
      }

      // Handle 204 No Content responses (no body to parse)
      if (response.status === 204) {
        return undefined as T;
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout - the operation took too long. Please try again.');
      }
      throw error;
    }
  }

  async get<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  async post<T>(endpoint: string, data?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'POST', data });
  }

  async put<T>(endpoint: string, data?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'PUT', data });
  }

  async delete<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }

  async patch<T>(endpoint: string, data?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'PATCH', data });
  }
}

export const apiClient = new ApiClient(API_BASE_URL);

// Health check function
export const checkHealth = () => apiClient.get<{
  status: string;
  timestamp: string;
  uptime: number;
  environment: string;
}>('/health');
