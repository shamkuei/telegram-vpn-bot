-- Migration: Create wallet_recharge_requests table
-- Description: This table stores wallet recharge requests with manual payment verification

-- Create the wallet_recharge_status enum
CREATE TYPE IF NOT EXISTS wallet_recharge_status AS ENUM (
  'pending',
  'awaiting_screenshot',
  'approved',
  'rejected',
  'expired'
);

-- Create the wallet_recharge_requests table
CREATE TABLE IF NOT EXISTS wallet_recharge_requests (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  verified_by BIGINT REFERENCES users(id),
  amount_cents INTEGER NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  status wallet_recharge_status NOT NULL DEFAULT 'awaiting_screenshot',

  -- Screenshot information
  screenshot_file_id VARCHAR(256),
  screenshot_file_unique_id VARCHAR(256) NOT NULL,
  screenshot_file_path VARCHAR(512),
  screenshot_mime_type VARCHAR(100),
  screenshot_file_size_bytes INTEGER,

  -- Payment reference
  payment_reference VARCHAR(256),
  user_note TEXT,

  -- Admin notes
  admin_note TEXT,
  rejection_reason TEXT,

  -- Result
  wallet_transaction_id BIGINT,

  -- Fraud detection
  ip_address VARCHAR(45),
  risk_score DECIMAL(3, 2) DEFAULT 0,

  -- Timestamps
  screenshot_received_at TIMESTAMP WITH TIME ZONE,
  verified_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for wallet_recharge_requests
CREATE INDEX IF NOT EXISTS idx_wallet_recharge_user_id ON wallet_recharge_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_recharge_status ON wallet_recharge_requests(status);
CREATE INDEX IF NOT EXISTS idx_wallet_recharge_verified_by ON wallet_recharge_requests(verified_by);
CREATE INDEX IF NOT EXISTS idx_wallet_recharge_created_at ON wallet_recharge_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_wallet_recharge_expires_at ON wallet_recharge_requests(expires_at);

-- Partial index for pending requests needing verification
CREATE INDEX IF NOT EXISTS idx_wallet_recharge_pending
  ON wallet_recharge_requests(id, user_id, created_at)
  WHERE status = 'pending' AND screenshot_file_id IS NOT NULL;

-- Partial index for expiring pending requests
CREATE INDEX IF NOT EXISTS idx_wallet_recharge_expiring_pending
  ON wallet_recharge_requests(id, user_id)
  WHERE status = 'pending';

-- Create a trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_wallet_recharge_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER wallet_recharge_requests_updated_at
  BEFORE UPDATE ON wallet_recharge_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_wallet_recharge_requests_updated_at();

-- Add comment to table
COMMENT ON TABLE wallet_recharge_requests IS 'Stores wallet recharge requests with manual payment verification and screenshot upload';
