import { InlineKeyboard } from 'grammy'
import type { Subscription } from '@/db/schema/index'

// ============================================================================
// Subscription Display Utilities
// ============================================================================

export function getSubscriptionKeyboard(subscription: Subscription): InlineKeyboard {
  const keyboard = new InlineKeyboard()

  switch (subscription.status) {
    case 'active':
      keyboard
        .text('🔄 Renew', `subscription:renew:${subscription.id}`)
        .row()
        .text('🔑 Get VPN Keys', `subscription:keys:${subscription.id}`)
        .row()
        .text('⚙️ Settings', `subscription:settings:${subscription.id}`)
        .row()
        .text('❌ Cancel', `subscription:cancel:${subscription.id}`)
      break

    case 'expiring':
      keyboard
        .text('🔄 Renew Now', `subscription:renew:${subscription.id}`)
        .text('🔑 Get VPN Keys', `subscription:keys:${subscription.id}`)
        .row()
        .text('❌ Cancel', `subscription:cancel:${subscription.id}`)
      break

    case 'expired':
      keyboard
        .text('🔄 Renew', `subscription:renew:${subscription.id}`)
        .row()
        .text('📦 Browse Plans', 'plans:page:1')
      break

    case 'suspended':
      keyboard
        .text('ℹ️ Help', 'help')
        .row()
        .text('📧 Contact Support', 'contact:support')
      break

    default:
      keyboard
        .text('ℹ️ Help', 'help')
  }

  keyboard.row().text('🏠 Main Menu', 'menu:main')

  return keyboard
}

export async function getUserSubscriptionsText(subscription: Subscription): Promise<string> {
  const { planQueries, serverQueries } = await import('@/db/queries.js')

  const plan = subscription.planId ? await planQueries.findById(subscription.planId) : null
  const server = subscription.serverId ? await serverQueries.findById(subscription.serverId) : null

  const { statusIcon } = getSubscriptionStatusDisplay(subscription)
  const daysRemaining = Math.floor(
    (new Date(subscription.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  )

  let message = `
${statusIcon} *${plan?.name || 'Unknown Plan'}*

*Status:* ${getSubscriptionStatusText(subscription)}
*Price:* $${((subscription.pricePaidCents || 0) / 100).toFixed(2)}
*Duration:* ${plan?.durationDays || 'N/A'} days
*Expires:* ${daysRemaining > 0 ? `in ${daysRemaining} days` : 'expired'}
  `

  if (subscription.dataLimitGb) {
    const usagePercentage = Math.floor((subscription.usedDataGb / subscription.dataLimitGb) * 100)
    const remainingDataGb = Math.max(0, subscription.dataLimitGb - subscription.usedDataGb)

    message += `

📊 *Data Usage*
   Used: ${subscription.usedDataGb} GB
   Limit: ${subscription.dataLimitGb} GB
   Remaining: ${remainingDataGb.toFixed(2)} GB (${usagePercentage}%)
    `
  }

  if (server) {
    message += `

🌍 *Server:* ${server.city}, ${server.countryCode}
    `
  }

  if (subscription.autoRenew) {
    message += `\n🔄 Auto-renew is enabled`
  } else {
    message += `\n⚠️ Auto-renew is disabled`
  }

  return message.trim()
}

function getSubscriptionStatusDisplay(subscription: Subscription) {
  switch (subscription.status) {
    case 'active':
      return { statusIcon: '✅', statusText: 'Active' }
    case 'expiring':
      return { statusIcon: '⚠️', statusText: 'Expiring Soon' }
    case 'expired':
      return { statusIcon: '❌', statusText: 'Expired' }
    case 'cancelled':
      return { statusIcon: '🚫', statusText: 'Cancelled' }
    case 'suspended':
      return { statusIcon: '🔒', statusText: 'Suspended' }
    default:
      return { statusIcon: '❓', statusText: subscription.status }
  }
}

function getSubscriptionStatusText(subscription: Subscription): string {
  const { statusText } = getSubscriptionStatusDisplay(subscription)
  return statusText
}
