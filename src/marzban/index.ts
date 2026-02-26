import { config } from '@/config/index'

// ============================================================================
// Types
// ============================================================================

export interface MarzbanConfig {
  baseURL: string
  username: string
  password: string
  timeout?: number
  retryAttempts?: number
  retryDelay?: number
}

export interface MarzbanUserResponse {
  username: string
  status: 'active' | 'disabled' | 'limited' | 'expired' | 'on_hold'
  expire: number | null
  data_limit: number | null
  used_traffic: number
  lifetime_used_traffic: number
  links: string[]
  subscription_url: string
  proxies: Record<string, any>
  excluded_inbounds: Record<string, string[]>
  created_at: string
  admin: string | null
}

export interface MarzbanUserCreate {
  username: string
  status?: 'active' | 'on_hold'
  expire?: number | null
  data_limit?: number | null
  data_limit_reset_strategy?: 'no_reset' | 'day' | 'week' | 'month' | 'year'
  proxies: Record<string, any>
  inbounds: Record<string, string[]>
  note?: string
  on_hold_timeout?: string | null
  on_hold_expire_duration?: number | null
  next_plan?: {
    data_limit?: number
    expire?: number
    add_remaining_traffic?: boolean
    fire_on_either?: boolean
  }
}

export interface MarzbanUserModify {
  status?: 'active' | 'disabled' | 'on_hold'
  expire?: number | null
  data_limit?: number | null
  data_limit_reset_strategy?: 'no_reset' | 'day' | 'week' | 'month' | 'year'
  proxies?: Record<string, any>
  inbounds?: Record<string, string[]>
  note?: string
  on_hold_timeout?: string | null
  on_hold_expire_duration?: number | null
  next_plan?: {
    data_limit?: number
    expire?: number
    add_remaining_traffic?: boolean
    fire_on_either?: boolean
  }
}

export interface MarzbanUsersResponse {
  users: MarzbanUserResponse[]
  total: number
}

export interface MarzbanUserUsage {
  node_id: number | null
  node_name: string
  used_traffic: number
}

export interface MarzbanTokenResponse {
  access_token: string
  token_type: string
}

export interface MarzbanSubscriptionUserResponse {
  username: string
  status: string
  expire: number | null
  data_limit: number | null
  used_traffic: number
  lifetime_used_traffic: number
  links: string[]
  subscription_url: string
}

// ============================================================================
// Circuit Breaker
// ============================================================================

class CircuitBreaker {
  private failures = 0
  private lastFailureTime = 0
  private isOpen = false
  private nextAttempt = 0

  constructor(
    private threshold: number = 5,
    private timeout: number = 60000, // 1 minute
    private halfOpenAttempts: number = 3
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.isOpen) {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is OPEN')
      }
      this.isOpen = false
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  private onSuccess() {
    this.failures = 0
    this.isOpen = false
  }

  private onFailure() {
    this.failures++
    this.lastFailureTime = Date.now()

    if (this.failures >= this.threshold) {
      this.isOpen = true
      this.nextAttempt = Date.now() + this.timeout
    }
  }

  getState() {
    return {
      isOpen: this.isOpen,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
      nextAttempt: this.nextAttempt
    }
  }

  reset() {
    this.failures = 0
    this.isOpen = false
    this.lastFailureTime = 0
    this.nextAttempt = 0
  }
}

// ============================================================================
// HTTP Client
// ============================================================================

class HttpClient {
  private token: string | null = null
  private tokenExpiry: number | null = null

  constructor(
    private config: MarzbanConfig,
    private circuitBreaker: CircuitBreaker
  ) {}

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.config.baseURL}${endpoint}`

    const defaultOptions: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...this.getAuthHeader()
      },
      signal: AbortSignal.timeout(this.config.timeout || 30000)
    }

    const response = await this.circuitBreaker.execute(async () => {
      const res = await fetch(url, { ...defaultOptions, ...options })
      return res
    })

    if (!response.ok) {
      const error = await response.text()
      throw new MarzbanError(
        `HTTP ${response.status}: ${error}`,
        response.status,
        endpoint
      )
    }

    return response.json() as Promise<T>
  }

  private async requestWithRetry<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const maxAttempts = this.config.retryAttempts || 3
    const delay = this.config.retryDelay || 1000
    let lastError: Error | undefined

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.request<T>(endpoint, options)
      } catch (error) {
        lastError = error as Error

        // Don't retry on 4xx errors (client errors)
        if (error instanceof MarzbanError && error.status >= 400 && error.status < 500) {
          throw error
        }

        // Exponential backoff
        if (attempt < maxAttempts) {
          const backoffDelay = delay * Math.pow(2, attempt - 1)
          await new Promise((resolve) => setTimeout(resolve, backoffDelay))
        }
      }
    }

    throw lastError
  }

  private getAuthHeader(): Record<string, string> {
    if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return { Authorization: `Bearer ${this.token}` }
    }
    return {}
  }

  async authenticate(): Promise<void> {
    const response = await this.request<MarzbanTokenResponse>('/api/admin/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        username: this.config.username,
        password: this.config.password
      })
    })

    this.token = response.access_token
    // Token expires in ~1 hour (Marzban default)
    this.tokenExpiry = Date.now() + 55 * 60 * 1000
  }

  get<T>(endpoint: string): Promise<T> {
    return this.requestWithRetry<T>(endpoint, { method: 'GET' })
  }

  post<T>(endpoint: string, body?: any): Promise<T> {
    return this.requestWithRetry<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined
    })
  }

  put<T>(endpoint: string, body?: any): Promise<T> {
    return this.requestWithRetry<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined
    })
  }

  delete<T>(endpoint: string): Promise<T> {
    return this.requestWithRetry<T>(endpoint, { method: 'DELETE' })
  }
}

// ============================================================================
// Custom Error
// ============================================================================

export class MarzbanError extends Error {
  constructor(
    message: string,
    public status: number,
    public endpoint: string
  ) {
    super(message)
    this.name = 'MarzbanError'
  }
}

// ============================================================================
// Marzban Client
// ============================================================================

export class MarzbanClient {
  private client: HttpClient
  private circuitBreaker: CircuitBreaker
  private isAuthenticated = false
  private authLock = false

  constructor(private config: MarzbanConfig) {
    this.circuitBreaker = new CircuitBreaker(5, 60000, 3)
    this.client = new HttpClient(config, this.circuitBreaker)
  }

  // ============================================================================
  // Authentication
  // ============================================================================

  /**
   * Authenticate with Marzban API
   */
  async authenticate(): Promise<void> {
    if (this.authLock) {
      // Wait for existing authentication to complete
      await new Promise((resolve) => setTimeout(resolve, 100))
      return
    }

    this.authLock = true
    try {
      await this.client.authenticate()
      this.isAuthenticated = true
    } finally {
      this.authLock = false
    }
  }

  /**
   * Ensure authenticated before making requests
   */
  private async ensureAuthenticated(): Promise<void> {
    if (!this.isAuthenticated) {
      await this.authenticate()
    }
  }

  // ============================================================================
  // User Operations
  // ============================================================================

  /**
   * Create a new user in Marzban
   */
  async createUser(user: MarzbanUserCreate): Promise<MarzbanUserResponse> {
    await this.ensureAuthenticated()
    return this.client.post<MarzbanUserResponse>('/api/user', user)
  }

  /**
   * Get user by username
   */
  async getUser(username: string): Promise<MarzbanUserResponse> {
    await this.ensureAuthenticated()
    return this.client.get<MarzbanUserResponse>(`/api/user/${username}`)
  }

  /**
   * Update user
   */
  async updateUser(username: string, modifications: MarzbanUserModify): Promise<MarzbanUserResponse> {
    await this.ensureAuthenticated()
    return this.client.put<MarzbanUserResponse>(`/api/user/${username}`, modifications)
  }

  /**
   * Delete user
   */
  async deleteUser(username: string): Promise<{ detail: string }> {
    await this.ensureAuthenticated()
    return this.client.delete<{ detail: string }>(`/api/user/${username}`)
  }

  /**
   * Reset user data usage
   */
  async resetUserUsage(username: string): Promise<MarzbanUserResponse> {
    await this.ensureAuthenticated()
    return this.client.post<MarzbanUserResponse>(`/api/user/${username}/reset`)
  }

  /**
   * Revoke user subscription (change links and token)
   */
  async revokeUserSubscription(username: string): Promise<MarzbanUserResponse> {
    await this.ensureAuthenticated()
    return this.client.post<MarzbanUserResponse>(`/api/user/${username}/revoke_sub`)
  }

  /**
   * Get users list with pagination
   */
  async getUsers(options?: {
    offset?: number
    limit?: number
    username?: string[]
    search?: string
    status?: string
    owner?: string[]
  }): Promise<MarzbanUsersResponse> {
    await this.ensureAuthenticated()

    const params = new URLSearchParams()
    if (options?.offset) params.set('offset', options.offset.toString())
    if (options?.limit) params.set('limit', options.limit.toString())
    if (options?.username) options.username.forEach((u) => params.append('username', u))
    if (options?.search) params.set('search', options.search)
    if (options?.status) params.set('status', options.status)
    if (options?.owner) options.owner.forEach((o) => params.append('admin', o))

    const queryString = params.toString()
    return this.client.get<MarzbanUsersResponse>(`/api/users${queryString ? `?${queryString}` : ''}`)
  }

  /**
   * Get user usage statistics
   */
  async getUserUsage(username: string, start?: string, end?: string): Promise<{
    usages: MarzbanUserUsage[]
    username: string
  }> {
    await this.ensureAuthenticated()

    const params = new URLSearchParams()
    if (start) params.set('start', start)
    if (end) params.set('end', end)

    const queryString = params.toString()
    return this.client.get<{ usages: MarzbanUserUsage[]; username: string }>(
      `/api/user/${username}/usage${queryString ? `?${queryString}` : ''}`
    )
  }

  /**
   * Get all users usage
   */
  async getAllUsersUsage(start?: string, end?: string, owner?: string[]): Promise<{
    usages: MarzbanUserUsage[]
  }> {
    await this.ensureAuthenticated()

    const params = new URLSearchParams()
    if (start) params.set('start', start)
    if (end) params.set('end', end)
    if (owner) owner.forEach((o) => params.append('admin', o))

    const queryString = params.toString()
    return this.client.get<{ usages: MarzbanUserUsage[] }>(
      `/api/users/usage${queryString ? `?${queryString}` : ''}`
    )
  }

  /**
   * Get expired users
   */
  async getExpiredUsers(options?: {
    expiredAfter?: string
    expiredBefore?: string
  }): Promise<string[]> {
    await this.ensureAuthenticated()

    const params = new URLSearchParams()
    if (options?.expiredAfter) params.set('expired_after', options.expiredAfter)
    if (options?.expiredBefore) params.set('expired_before', options.expiredBefore)

    const queryString = params.toString()
    return this.client.get<string[]>(
      `/api/users/expired${queryString ? `?${queryString}` : ''}`
    )
  }

  /**
   * Delete expired users
   */
  async deleteExpiredUsers(options?: {
    expiredAfter?: string
    expiredBefore?: string
  }): Promise<string[]> {
    await this.ensureAuthenticated()

    const params = new URLSearchParams()
    if (options?.expiredAfter) params.set('expired_after', options.expiredAfter)
    if (options?.expiredBefore) params.set('expired_before', options.expiredBefore)

    const queryString = params.toString()
    return this.client.delete<string[]>(
      `/api/users/expired${queryString ? `?${queryString}` : ''}`
    )
  }

  // ============================================================================
  // Subscription Operations
  // ============================================================================

  /**
   * Get subscription info by token
   */
  async getSubscriptionInfo(token: string): Promise<MarzbanSubscriptionUserResponse> {
    return this.client.get<MarzbanSubscriptionUserResponse>(`/subscribe/${token}/info`)
  }

  /**
   * Get subscription by token with specific format
   */
  async getSubscription(
    token: string,
    format: 'clash' | 'clash-meta' | 'sing-box' | 'outline' | 'v2ray' | 'v2ray-json' = 'v2ray'
  ): Promise<string> {
    const response = await fetch(`${this.config.baseURL}/subscribe/${token}/${format}`, {
      headers: { Accept: 'application/json, text/plain, */*' }
    })

    if (!response.ok) {
      throw new MarzbanError(`Failed to get subscription: ${response.statusText}`, response.status, `/subscribe/${token}/${format}`)
    }

    const contentType = response.headers.get('content-type')
    if (contentType?.includes('application/json')) {
      const data = await response.json()
      return JSON.stringify(data)
    }

    return response.text()
  }

  /**
   * Get subscription URL for a user
   */
  getSubscriptionUrl(token: string): string {
    return `${this.config.baseURL}/subscribe/${token}`
  }

  // ============================================================================
  // Admin Operations
  // ============================================================================

  /**
   * Create a new admin
   */
  async createAdmin(admin: {
    username: string
    password: string
    is_sudo: boolean
  }): Promise<any> {
    await this.ensureAuthenticated()
    return this.client.post('/api/admin', admin)
  }

  // ============================================================================
  // Node Operations
  // ============================================================================

  /**
   * Get all nodes
   */
  async getNodes(): Promise<any[]> {
    await this.ensureAuthenticated()
    return this.client.get<any[]>('/api/nodes')
  }

  /**
   * Get node usage
   */
  async getNodesUsage(): Promise<any> {
    await this.ensureAuthenticated()
    return this.client.get('/api/nodes/usage')
  }

  // ============================================================================
  // Health & Status
  // ============================================================================

  /**
   * Check if Marzban API is accessible
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.authenticate()
      return true
    } catch {
      return false
    }
  }

  /**
   * Get circuit breaker state
   */
  getCircuitBreakerState() {
    return this.circuitBreaker.getState()
  }

  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker() {
    this.circuitBreaker.reset()
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createMarzbanClient(): MarzbanClient {
  return new MarzbanClient({
    baseURL: config.MARZBAN_API_URL,
    username: config.MARZBAN_ADMIN_USERNAME,
    password: config.MARZBAN_ADMIN_PASSWORD,
    timeout: config.MARZBAN_TIMEOUT,
    retryAttempts: config.MARZBAN_RETRY_ATTEMPTS,
    retryDelay: config.MARZBAN_RETRY_DELAY
  })
}

// Export singleton instance
export const marzban = createMarzbanClient()
