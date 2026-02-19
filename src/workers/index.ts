import { Queue, Worker, Job, QueueEvents } from 'bullmq'
import { redis } from '@/cache/index.js'
import { config } from '@/config/index.js'

// ============================================================================
// BullMQ Configuration
// ============================================================================

const defaultQueueOptions = {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: {
      age: 3600, // 1 hour
      count: 100
    },
    removeOnFail: {
      age: 7200, // 2 hours
      count: 50
    }
  }
}

// ============================================================================
// Job Queue Definitions
// ============================================================================

export const paymentQueue = new Queue('payments', {
  ...defaultQueueOptions,
  defaultJobOptions: {
    ...defaultQueueOptions.defaultJobOptions,
    concurrency: config.CONCURRENCY_PAYMENT_WORKER || 5
  }
})

export const marzbanQueue = new Queue('marzban-sync', {
  ...defaultQueueOptions,
  defaultJobOptions: {
    ...defaultQueueOptions.defaultJobOptions,
    concurrency: config.CONCURRENCY_MARZBAN_WORKER || 10
  }
})

export const notificationQueue = new Queue('notifications', {
  ...defaultQueueOptions,
  defaultQueueOptions: {
    ...defaultQueueOptions.defaultJobOptions,
    concurrency: config.CONCURRENCY_NOTIFICATION_WORKER || 20,
    limiter: {
      max: 100, // 100 jobs per second
      duration: 1000
    }
  }
})

export const scheduledQueue = new Queue('scheduled', {
  ...defaultQueueOptions,
  defaultJobOptions: {
    ...defaultQueueOptions.defaultJobOptions,
    concurrency: config.CONCURRENCY_SCHEDULED_WORKER || 3
  }
})

export const maintenanceQueue = new Queue('maintenance', {
  ...defaultQueueOptions,
  defaultJobOptions: {
    ...defaultQueueOptions.defaultJobOptions,
    concurrency: 1
  }
})

// ============================================================================
// Queue Event Listeners (Logging)
// ============================================================================

function setupQueueListeners(queue: Queue) {
  queue.on('waiting', (job) => {
    console.log(`[Queue:${queue.name}] Job ${job.id} is waiting`)
  })

  queue.on('active', (job) => {
    console.log(`[Queue:${queue.name}] Job ${job.id} started`)
  })

  queue.on('completed', (job) => {
    console.log(`[Queue:${queue.name}] Job ${job.id} completed`)
  })

  queue.on('failed', (job, error) => {
    console.error(`[Queue:${queue.name}] Job ${job.id} failed:`, error.message)
  })

  queue.on('error', (error) => {
    console.error(`[Queue:${queue.name}] Queue error:`, error)
  })
}

setupQueueListeners(paymentQueue)
setupQueueListeners(marzbanQueue)
setupQueueListeners(notificationQueue)
setupQueueListeners(scheduledQueue)
setupQueueListeners(maintenanceQueue)

// ============================================================================
// Job Types
// ============================================================================

// Payment Jobs
export interface PaymentJobData {
  type: 'check' | 'confirm' | 'expire' | 'refund'
  paymentId: number
  provider: string
  providerInvoiceId: string
}

// Marzban Sync Jobs
export interface MarzbanJobData {
  type: 'create_user' | 'update_user' | 'delete_user' | 'reset_usage' | 'sync_usage'
  userId?: number
  vpnAccountId?: number
  subscriptionId?: number
  username?: string
  data?: any
}

// Notification Jobs
export interface NotificationJobData {
  type: 'telegram' | 'email'
  userId: number
  title: string
  message: string
  parseMode?: string
  keyboard?: any
}

// Scheduled Jobs
export interface ScheduledJobData {
  type: 'check_expired_subscriptions' | 'sync_all_usage' | 'check_pending_payments' | 'cleanup_expired_cache' | 'generate_daily_reports' | 'reset_user_usage'
  timestamp?: number
}

// Maintenance Jobs
export interface MaintenanceJobData {
  type: 'cleanup_old_sessions' | 'archive_old_logs' | 'optimize_database'
  timestamp?: number
}

// ============================================================================
// Job Creation Helpers
// ============================================================================

export async function addPaymentJob(data: PaymentJobData, options?: any) {
  return await paymentQueue.add('process-payment', data, {
    ...options,
    jobId: `payment_${data.type}_${data.paymentId}_${Date.now()}`
  })
}

export async function addMarzbanJob(data: MarzbanJobData, options?: any) {
  return await marzbanQueue.add('sync-marzban', data, {
    ...options,
    jobId: `marzban_${data.type}_${data.userId || data.vpnAccountId || 'unknown'}_${Date.now()}`
  })
}

export async function addNotificationJob(data: NotificationJobData, options?: any) {
  return await notificationQueue.add('send-notification', data, {
    ...options,
    jobId: `notification_${data.type}_${data.userId}_${Date.now()}`
  })
}

export async function addScheduledJob(data: ScheduledJobData, options?: any) {
  return await scheduledQueue.add('scheduled-task', data, {
    ...options,
    jobId: `scheduled_${data.type}_${Date.now()}`
  })
}

export async function addMaintenanceJob(data: MaintenanceJobData, options?: any) {
  return await maintenanceQueue.add('maintenance-task', data, {
    ...options,
    jobId: `maintenance_${data.type}_${Date.now()}`
  })
}

// ============================================================================
// Scheduled Job Setup (Cron-like)
// ============================================================================

export async function setupScheduledJobs() {
  // Check expiring users (every hour)
  await scheduleRecurringJob(
    scheduledQueue,
    {
      type: 'check_expired_subscriptions'
    } as ScheduledJobData,
    '0 * * * *' // Every hour
  )

  // Check pending payments (every minute)
  await scheduleRecurringJob(
    scheduledQueue,
    {
      type: 'check_pending_payments'
    } as ScheduledJobData,
    '* * * * *' // Every minute
  )

  // Sync all usage from Marzban (every 5 minutes)
  await scheduleRecurringJob(
    scheduledQueue,
    {
      type: 'sync_all_usage'
    } as ScheduledJobData,
    '*/5 * * *' // Every 5 minutes
  )

  // Clean up expired cache (daily at 03:00)
  await scheduleRecurringJob(
    scheduledQueue,
    {
      type: 'cleanup_expired_cache'
    } as ScheduledJobData,
    '0 3 * * *' // Daily at 3 AM
  )

  // Reset user usage (daily at 00:00)
  await scheduleRecurringJob(
    scheduledQueue,
    {
      type: 'reset_user_usage'
    } as ScheduledJobData,
    '0 0 * * *' // Daily at midnight
  )

  // Generate daily reports (daily at 00:00)
  await scheduleRecurringJob(
    scheduledQueue,
    {
      type: 'generate_daily_reports'
    } as ScheduledJobData,
    '0 0 * * *' // Daily at midnight
  )
}

async function scheduleRecurringJob(
  queue: Queue,
  data: ScheduledJobData,
  cronPattern: string
) {
  // Add initial job
  await queue.add('scheduled-task', data, {
    repeat: {
      pattern: cronPattern
    }
  })
}

// ============================================================================
// Queue Paused/Resumed
// ============================================================================

export async function pauseQueue(queue: Queue) {
  await queue.pause()
  console.log(`Queue ${queue.name} paused`)
}

export async function resumeQueue(queue: Queue) {
  await queue.resume()
  console.log(`Queue ${queue.name} resumed`)
}

export async function pauseAllQueues() {
  await Promise.all([
    pauseQueue(paymentQueue),
    pauseQueue(marzbanQueue),
    pauseQueue(notificationQueue),
    pauseQueue(scheduledQueue),
    pauseQueue(maintenanceQueue)
  ])
}

export async function resumeAllQueues() {
  await Promise.all([
    resumeQueue(paymentQueue),
    resumeQueue(marzbanQueue),
    resumeQueue(notificationQueue),
    resumeQueue(scheduledQueue),
    resumeQueue(maintenanceQueue)
  ])
}

// ============================================================================
// Queue Statistics
// ============================================================================

export async function getQueueStats() {
  const [
    paymentStats,
    marzbanStats,
    notificationStats,
    scheduledStats,
    maintenanceStats
  ] = await Promise.all([
      paymentQueue.getJobCounts('waiting', 'active', 'completed', 'failed'),
      marzbanQueue.getJobCounts('waiting', 'active', 'completed', 'failed'),
      notificationQueue.getJobCounts('waiting', 'active', 'completed', 'failed'),
      scheduledQueue.getJobCounts('waiting', 'active', 'completed', 'failed'),
      maintenanceQueue.getJobCounts('waiting', 'active', 'completed', 'failed')
  ])

  return {
    payment: paymentStats,
    marzban: marzbanStats,
    notification: notificationStats,
    scheduled: scheduledStats,
    maintenance: maintenanceStats
  }
}

// ============================================================================
// Clean Shutdown
// ============================================================================

export async function closeAllQueues() {
  await Promise.all([
    paymentQueue.close(),
    marzbanQueue.close(),
    notificationQueue.close(),
    scheduledQueue.close(),
    maintenanceQueue.close()
  ])
}
