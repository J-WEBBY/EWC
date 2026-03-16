-- Migration 067: Agent Guardrails
-- Rules that are injected into every agent system prompt.

CREATE TABLE IF NOT EXISTS agent_guardrails (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  rule_type   TEXT NOT NULL CHECK (rule_type IN (
    'never_say', 'always_say', 'topic_block',
    'required_disclaimer', 'tone_rule', 'compliance_rule'
  )),
  applies_to  TEXT NOT NULL DEFAULT 'all',
  content     TEXT NOT NULL,
  priority    INT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_guardrails_tenant_id ON agent_guardrails(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_guardrails_active ON agent_guardrails(tenant_id, is_active) WHERE is_active = TRUE;

-- ── Seed starter guardrails for EWC ──────────────────────────────────────────

INSERT INTO agent_guardrails (tenant_id, title, rule_type, applies_to, content, priority, is_active)
SELECT
  t.id,
  g.title,
  g.rule_type::TEXT,
  'all',
  g.content,
  g.priority,
  TRUE
FROM tenants t
CROSS JOIN (VALUES
  (
    'No medical diagnoses',
    'never_say',
    'Never state or imply specific medical diagnoses or suggest that a patient has a particular medical condition',
    90
  ),
  (
    'No guaranteed outcomes',
    'never_say',
    'Never make promises about treatment outcomes or results — all treatments vary per individual',
    85
  ),
  (
    'No competitor discussion',
    'topic_block',
    'Do not discuss competitor clinics, their pricing, treatments or staff under any circumstances',
    80
  ),
  (
    'Guidance disclaimer',
    'required_disclaimer',
    'Always clarify that information provided is for general guidance only and is not a substitute for a professional medical consultation',
    75
  ),
  (
    'Warm professional tone',
    'tone_rule',
    'Always maintain a warm, professional and reassuring tone — never cold, clinical or robotic. Patients should feel heard and cared for',
    70
  ),
  (
    'No drug doses',
    'compliance_rule',
    'Never quote specific drug doses, medication names or prescription medication details in any patient-facing communication',
    95
  ),
  (
    'Consultation before pricing',
    'always_say',
    'When a patient asks about pricing, always direct them to book a free consultation first before quoting specific figures',
    65
  ),
  (
    'Recommend professional consultation',
    'compliance_rule',
    'Always recommend that the patient speak to a qualified practitioner before proceeding with any aesthetic or medical treatment',
    60
  )
) AS g(title, rule_type, content, priority)
WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT DO NOTHING;
