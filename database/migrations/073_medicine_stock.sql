-- =============================================================================
-- Migration 073: Medicines & Stock table + clear seeded equipment data
-- =============================================================================

DO $$ BEGIN RAISE NOTICE '=== Migration 073: Medicine & Stock — START ==='; END $$;

-- Clear seeded equipment rows (user will enter their own data)
DELETE FROM compliance_equipment ce
USING tenants t
WHERE ce.tenant_id = t.id AND t.slug = 'edgbaston-wellness';

-- Create medicines/stock tracking table
CREATE TABLE IF NOT EXISTS compliance_medicines (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  item_code           TEXT        NOT NULL,
  name                TEXT        NOT NULL,
  item_type           TEXT        NOT NULL DEFAULT 'medicine' CHECK (item_type IN ('medicine', 'stock', 'consumable')),
  category            TEXT,
  quantity            INTEGER,
  unit                TEXT,
  batch_number        TEXT,
  expiry_date         DATE,
  storage_location    TEXT,
  min_stock_level     INTEGER,
  responsible_user_id UUID        REFERENCES users(id) ON DELETE SET NULL,
  last_checked_date   DATE,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, item_code)
);

CREATE INDEX IF NOT EXISTS idx_compliance_medicines_tenant_id ON compliance_medicines(tenant_id);

DO $$ BEGIN RAISE NOTICE '073: compliance_medicines table created, equipment seed cleared.'; END $$;
DO $$ BEGIN RAISE NOTICE '=== Migration 073: Medicine & Stock — DONE ==='; END $$;
