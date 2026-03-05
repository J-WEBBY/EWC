-- =============================================================================
-- Migration 035: Team Spaces
--
-- Adds team_posts — internal staff communication, announcements,
-- handovers, tasks, resource links, and kudos within named spaces.
-- =============================================================================

CREATE TABLE IF NOT EXISTS team_posts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which team space this post belongs to
  space       TEXT        NOT NULL DEFAULT 'all_staff'
    CHECK (space IN ('all_staff', 'reception', 'clinical', 'management')),

  -- Content type
  category    TEXT        NOT NULL DEFAULT 'update'
    CHECK (category IN ('announcement', 'handover', 'task', 'resource', 'kudos', 'update')),

  -- Content
  title       TEXT,
  body        TEXT        NOT NULL,
  tags        TEXT[]      DEFAULT '{}',

  -- Author (nullable for system posts)
  author_id   UUID        REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT        NOT NULL DEFAULT 'System',
  author_role TEXT,

  -- Engagement
  likes       INTEGER     NOT NULL DEFAULT 0,
  pinned      BOOLEAN     NOT NULL DEFAULT FALSE,

  -- Extra structured data (resource_url, task_assignee, task_due, etc.)
  metadata    JSONB       DEFAULT '{}',

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_posts_space    ON team_posts(space);
CREATE INDEX IF NOT EXISTS idx_team_posts_category ON team_posts(category);
CREATE INDEX IF NOT EXISTS idx_team_posts_pinned   ON team_posts(pinned);
CREATE INDEX IF NOT EXISTS idx_team_posts_created  ON team_posts(created_at DESC);

CREATE OR REPLACE FUNCTION update_team_post_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE TRIGGER trg_team_post_updated_at
  BEFORE UPDATE ON team_posts
  FOR EACH ROW EXECUTE FUNCTION update_team_post_updated_at();

-- =============================================================================
-- VERIFY
-- =============================================================================

DO $$
DECLARE v_cols INT;
BEGIN
  SELECT COUNT(*) INTO v_cols
    FROM information_schema.columns WHERE table_name = 'team_posts';
  RAISE NOTICE '✓ Migration 035 complete';
  RAISE NOTICE '  team_posts columns: %', v_cols;
END $$;
