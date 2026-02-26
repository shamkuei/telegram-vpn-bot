import { createYoga } from 'graphql-yoga'
import { makeExecutableSchema } from '@graphql-tools/schema'
import { typeDefs } from './types'
import { resolvers } from './resolvers/index'
import type { Context } from './context'
import { createContext } from './context'

// ============================================================================
// GraphQL Schema
// ============================================================================

const schema = makeExecutableSchema({
  typeDefs,
  resolvers
})

// ============================================================================
// GraphQL Yoga Server
// ============================================================================

export const { yoga, handleRequest } = createYoga<{
  req: Request
  res: Response
  ctx: Context
}>({
  schema,
  context: async ({ request }) => {
    return await createContext(request)
  },
  graphqlEndpoint: '/graphql',
  // GraphQL playground in development only
  graphiql: process.env.GRAPHQL_PLAYGROUND === 'true',
  // Introspection
  maskedErrors: process.env.NODE_ENV === 'production',
  // CORS
  cors: {
    origin: ['http://localhost:3000', 'https://yourdomain.com'],
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS']
  },
  // Logging
  logging: process.env.LOG_LEVEL === 'debug',
  // Body parser limit
  bodyParserLimit: '1mb'
})

// ============================================================================
// Handler for Hono integration
// ============================================================================

export async function graphqlHandler(request: Request): Promise<Response> {
  return handleRequest(request)
}

// ============================================================================
// WebSocket handler for subscriptions (if needed)
// ============================================================================

export const graphqlEndpoint = '/graphql'
export const subscriptionEndpoint = '/graphql/stream'
