import type { User } from '@/db/schema/users'

// ============================================================================
// GraphQL Context
// ============================================================================

export interface Context {
  user?: User
  isAdmin?: boolean
  requestId?: string
  ipAddress?: string
  userAgent?: string
}

export type CreateContextFn = () => Context | Promise<Context>

// ============================================================================
// Auth Context Helper
// ============================================================================

export async function createContext(
  request?: Request
): Promise<Context> {
  const context: Context = {
    requestId: crypto.randomUUID?.() || Math.random().toString(36).substring(7),
    ipAddress: request?.headers.get('x-forwarded-for') ||
              request?.headers.get('x-real-ip') ||
              undefined,
    userAgent: request?.headers.get('user-agent') || undefined
  }

  // Extract user from session/token if available
  // This will be implemented with actual auth
  // For now, we'll use the session from headers or JWT token

  return context
}

// ============================================================================
// Auth Middleware for GraphQL
// ============================================================================

export async function authenticateUser(
  context: Context,
  telegramId: number
): Promise<User | null> {
  const { userQueries } = await import('@/db/queries.js')

  const user = await userQueries.findByTelegramId(telegramId)

  if (user) {
    context.user = user
    context.isAdmin = user.isReseller // For now, resellers have admin-like access

    // Update last activity
    await userQueries.updateLastActivity(user.id)
  }

  return user
}
