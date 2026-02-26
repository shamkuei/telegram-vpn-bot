import type { User, Wallet } from '@/db/schema/index'

// ============================================================================
// Profile Display Utilities
// ============================================================================

export function getUserProfileText(user: User, wallet: Wallet): string {
  const balanceUsd = (wallet.balanceCents / 100).toFixed(2)
  const availableBalanceUsd = ((wallet.balanceCents - wallet.frozenBalanceCents) / 100).toFixed(2)

  let message = `
👤 *Profile*

*Name:* ${user.telegramFirstName} ${user.telegramLastName || ''}
*Username:* @${user.telegramUsername || 'N/A'}
*Telegram ID:* \`${user.telegramId}\`

*Status:* ${getUserStatusIcon(user.status)} ${user.status}
${user.isReseller ? `🏆 *Reseller Tier:* ${user.resellerTier || 'N/A'}` : ''}

💳 *Wallet Balance:* $${balanceUsd}
   Available: $${availableBalanceUsd}
   ${wallet.frozenBalanceCents > 0 ? `Frozen: $${(wallet.frozenBalanceCents / 100).toFixed(2)}` : ''}

*Trust Score:* ${Math.floor((user.trustScore || 0) * 100)}%
${user.isFlagged ? '⚠️ *Account flagged for review*' : ''}

*Member Since:* ${new Date(user.joinedAt).toLocaleDateString()}
  `

  return message.trim()
}

function getUserStatusIcon(status: string): string {
  switch (status) {
    case 'active':
      return '✅'
    case 'suspended':
      return '🔒'
    case 'banned':
      return '🚫'
    case 'deleted':
      return '🗑️'
    default:
      return '❓'
  }
}
