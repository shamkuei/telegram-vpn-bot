import { randomBytes } from 'crypto'

/**
 * Generate a unique referral code
 */
export function generateReferralCode(length: number = 10): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // No ambiguous chars
  let result = ''

  for (let i = 0; i < length; i++) {
    const randomIndex = randomBytes(1)[0] % chars.length
    result += chars[randomIndex]
  }

  return result
}

/**
 * Validate referral code format
 */
export function isValidReferralCode(code: string): boolean {
  return /^[A-Z0-9]{8,12}$/.test(code)
}
