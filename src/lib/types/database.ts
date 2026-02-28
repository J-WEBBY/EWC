// =============================================================================
// Edgbaston Wellness Clinic — Database Types
// Single-tenant schema — no tenant_id anywhere
// =============================================================================

// ---------------------------------------------------------------------------
// Clinic Configuration
// ---------------------------------------------------------------------------

export interface ClinicConfig {
  id: string;
  clinic_name: string;
  ai_name: string;
  brand_color: string;
  logo_url: string | null;
  tone: 'professional' | 'warm' | 'clinical' | 'friendly';
  tagline: string | null;
  manifesto: string | null;
  ai_persona: {
    traits?: string[];
    communication_style?: string;
    confidence?: number;
    philosophy?: string;
  };
  neural_contract: {
    tone?: string;
    response_style?: string;
    context?: string;
  };
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------

export interface Department {
  id: string;
  name: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export interface RolePermissions {
  can_manage_users?: boolean;
  can_manage_agents?: boolean;
  can_view_all_signals?: boolean;
  can_view_department_signals?: boolean;
  can_create_signals?: boolean;
  can_approve_signals?: boolean;
  can_manage_knowledge_base?: boolean;
  can_view_reports?: boolean;
  can_manage_integrations?: boolean;
  can_manage_system?: boolean;
  can_view_audit_trail?: boolean;
}

export interface Role {
  id: string;
  name: string;
  slug: string;
  permission_level: number;
  permissions: RolePermissions;
  is_admin: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export type UserStatus = 'active' | 'invited' | 'suspended' | 'deactivated';

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  display_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  job_title: string | null;
  department_id: string | null;
  role_id: string | null;
  // Auth (never returned to client)
  password_hash?: string;
  temp_password_hash?: string;
  must_change_password: boolean;
  password_changed_at: string | null;
  // Onboarding
  staff_onboarding_completed: boolean;
  staff_onboarding_completed_at: string | null;
  onboarding_responses: Record<string, unknown>;
  // Status
  status: UserStatus;
  is_admin: boolean;
  last_login_at: string | null;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // Joined
  department?: Department;
  role?: Role;
}

// User profile (safe to send to client — no password fields)
export interface UserProfile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  display_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  job_title: string | null;
  department_id: string | null;
  role_id: string | null;
  staff_onboarding_completed: boolean;
  status: UserStatus;
  is_admin: boolean;
  last_login_at: string | null;
  department?: Department;
  role?: Role;
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export type AgentScope = 'general' | 'sales' | 'patient_relations' | 'clinical' | 'operations';

export interface Agent {
  id: string;
  agent_key: string;
  name: string;
  display_name?: string; // alias for name — backward compat
  description: string | null;
  avatar_url: string | null;
  icon?: string | null;
  type?: string | null;
  scope: AgentScope | string;
  domains: string[];
  keywords: string[];
  critical_keywords: string[];
  handles?: string[];
  example_requests?: string[];
  system_prompt: string | null;
  is_active: boolean;
  is_catch_all: boolean;
  total_signals_handled: number;
  avg_confidence_score: number;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Legacy type aliases — kept for backward compat during rebuild
// ---------------------------------------------------------------------------

export type MaturityMode = 'bootstrap' | 'guided' | 'autonomous';

export interface SignalWithJudgement extends Signal {
  judgement?: Judgement;
}

export interface EngineStats {
  totalSignals: number;
  judgedSignals: number;
  pendingDecisions: number;
  closedSignals: number;
  avgConfidence: number;
}

export interface Decision {
  id: string;
  signal_id: string;
  judgement_id: string | null;
  decision: 'accept' | 'reject' | 'escalate' | 'defer';
  rationale: string | null;
  decided_by_user_id: string | null;
  created_at: string;
}

export type DecisionAction = 'accept' | 'reject' | 'escalate' | 'defer';

export interface Outcome {
  id: string;
  signal_id: string;
  outcome_description: string;
  was_successful: boolean | null;
  recorded_by_user_id: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

export type SignalType = 'task' | 'event' | 'alert' | 'objective' | 'insight';
export type SignalPriority = 'low' | 'medium' | 'high' | 'critical';
export type SignalStatus =
  | 'new'
  | 'pending_approval'
  | 'processing'
  | 'judged'
  | 'awaiting_decision'
  | 'decided'
  | 'acted'
  | 'outcome_recorded'
  | 'resolved'
  | 'archived'
  | 'closed';

export type ResponseMode = 'auto' | 'agentic' | 'supervised' | 'human_only';

export interface ActionLogEntry {
  timestamp: string;
  actor: string;   // 'system' | 'agent:crm_agent' | 'automation:...' | 'patient' | 'user'
  action: string;  // 'signal_created' | 'sms_sent' | 'escalated' | 'resolved' | etc.
  note: string;
}

export interface Signal {
  id: string;
  signal_type: SignalType;
  title: string;
  description: string | null;
  priority: SignalPriority;
  status: SignalStatus;
  category: string | null;
  source_type: string;
  source_agent_id: string | null;
  assigned_agent_id: string | null;
  assigned_department_id: string | null;
  created_by_user_id: string | null;
  conversation_id: string | null;
  tags: string[];
  data: Record<string, unknown>;
  user_input: string | null;
  ai_classification: Record<string, unknown>;
  assignment_confidence: number | null;
  assigned_reasoning: string | null;
  // Active signal architecture
  response_mode: ResponseMode;
  action_log: ActionLogEntry[];
  resolved_at: string | null;
  last_action_at: string | null;
  assigned_to: string | null;
  related_signals: string[];
  created_at: string;
  updated_at: string;
  // Joined
  source_agent?: Agent;
  assigned_agent?: Agent;
  assigned_department?: Department;
  created_by?: UserProfile;
}

// ---------------------------------------------------------------------------
// Judgements
// ---------------------------------------------------------------------------

export type JudgementRecommendation = 'accept' | 'reject' | 'escalate' | 'defer' | 'investigate';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface Judgement {
  id: string;
  signal_id: string;
  agent_id: string | null;
  confidence: number | null;
  reasoning: string | null;
  recommendation: JudgementRecommendation | null;
  suggested_actions: string[];
  risk_level: RiskLevel;
  metadata: Record<string, unknown>;
  created_at: string;
  // Joined
  signal?: Signal;
  agent?: Agent;
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export interface ChatConversation {
  id: string;
  user_id: string;
  title: string;
  agent_scope: string | null;
  is_pinned: boolean;
  is_archived: boolean;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  agent_scope: string | null;
  model_used: string | null;
  tool_calls: unknown[];
  metadata: Record<string, unknown>;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Agent Memories
// ---------------------------------------------------------------------------

export type MemoryType = 'conversation' | 'correction' | 'pattern' | 'preference';

export interface AgentMemory {
  id: string;
  agent_key: string;
  memory_type: MemoryType;
  content: string;
  importance: number;
  access_count: number;
  metadata: Record<string, unknown>;
  created_at: string;
  last_accessed_at: string;
}

// ---------------------------------------------------------------------------
// Knowledge Base
// ---------------------------------------------------------------------------

export type DocumentProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface KnowledgeCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parent_category_id: string | null;
  display_order: number;
  created_at: string;
}

export interface KnowledgeDocument {
  id: string;
  category_id: string | null;
  uploaded_by_user_id: string | null;
  file_name: string;
  file_type: string | null;
  file_size_bytes: number | null;
  storage_path: string | null;
  title: string;
  description: string | null;
  tags: string[];
  processing_status: DocumentProcessingStatus;
  processed_at: string | null;
  chunk_count: number;
  visibility: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // Joined
  category?: KnowledgeCategory;
}

export interface KnowledgeChunk {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  embedding: number[] | null; // vector(1536)
  page_number: number | null;
  section_title: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  // Joined
  document?: KnowledgeDocument;
}

// ---------------------------------------------------------------------------
// Cliniko Integration
// ---------------------------------------------------------------------------

export interface ClinikoConfig {
  id: string;
  api_key_encrypted: string | null;
  api_url: string;
  shard: string;
  is_connected: boolean;
  last_sync_at: string | null;
  last_sync_status: string | null;
  sync_error: string | null;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ClinikoPatient {
  id: string;
  cliniko_id: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  gender: string | null;
  address: {
    line1?: string;
    line2?: string;
    city?: string;
    postcode?: string;
    country?: string;
  };
  notes: string | null;
  referral_source: string | null;
  created_in_cliniko_at: string | null;
  updated_in_cliniko_at: string | null;
  last_synced_at: string;
  raw_data: Record<string, unknown>;
  created_at: string;
}

export interface ClinikoAppointment {
  id: string;
  cliniko_id: number;
  cliniko_patient_id: number | null;
  appointment_type: string | null;
  practitioner_name: string | null;
  starts_at: string | null;
  ends_at: string | null;
  duration_minutes: number | null;
  status: string | null;
  cancellation_reason: string | null;
  notes: string | null;
  invoice_status: string | null;
  room_name: string | null;
  last_synced_at: string;
  raw_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // Joined
  patient?: ClinikoPatient;
}

export interface ClinikoSyncLog {
  id: string;
  sync_type: 'patients' | 'appointments' | 'full';
  status: 'started' | 'completed' | 'failed';
  records_synced: number;
  records_failed: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

// ---------------------------------------------------------------------------
// Audit Trail
// ---------------------------------------------------------------------------

export interface AuditEntry {
  id: string;
  user_id: string | null;
  action_type: string;
  resource_type: string | null;
  resource_id: string | null;
  previous_state: Record<string, unknown> | null;
  new_state: Record<string, unknown> | null;
  ip_address: string | null;
  details: Record<string, unknown>;
  created_at: string;
  // Joined
  user?: UserProfile;
}

// ---------------------------------------------------------------------------
// Auth / Session
// ---------------------------------------------------------------------------

export interface AuthSession {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
  isAdmin: boolean;
  departmentId: string | null;
  roleId: string | null;
  mustChangePassword: boolean;
  staffOnboardingCompleted: boolean;
}

// ---------------------------------------------------------------------------
// Common result wrapper
// ---------------------------------------------------------------------------

export interface ActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}
