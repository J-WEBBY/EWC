-- =====================================================
-- JWEBLY SYSTEM - Migration 003: Seed Industries
-- Predefined industry verticals with configurations
-- =====================================================

-- =====================================================
-- INDUSTRIES
-- =====================================================

INSERT INTO industries (slug, name, description, terminology, default_ai_tools, compliance_requirements) VALUES

-- RECRUITMENT
('recruitment', 'Recruitment & Staffing', 'Recruitment agencies, staffing firms, talent acquisition teams',
'{
    "client": "candidate",
    "customer": "client company",
    "project": "placement",
    "meeting": "interview",
    "employee": "recruiter",
    "deadline": "closing date",
    "report": "pipeline report"
}'::jsonb,
'[
    "CV parsing and screening",
    "Interview scheduling",
    "Candidate matching",
    "Job posting automation",
    "Reference checking",
    "Offer letter generation",
    "Pipeline analytics"
]'::jsonb,
'[
    {"requirement": "UK GDPR", "category": "data_protection"},
    {"requirement": "Employment Agency Standards", "category": "industry_regulation"},
    {"requirement": "Right to Work Verification", "category": "legal_compliance"}
]'::jsonb),

-- ACCOUNTING
('accounting', 'Accounting & Finance', 'Accounting firms, bookkeeping services, financial advisors',
'{
    "client": "client",
    "project": "engagement",
    "meeting": "review meeting",
    "employee": "accountant",
    "deadline": "filing deadline",
    "report": "financial statement"
}'::jsonb,
'[
    "Invoice processing",
    "Expense categorization",
    "Tax deadline tracking",
    "Client document collection",
    "Financial reporting",
    "Audit trail management",
    "Compliance monitoring"
]'::jsonb,
'[
    {"requirement": "UK GDPR", "category": "data_protection"},
    {"requirement": "ICAEW/ACCA Standards", "category": "professional_standards"},
    {"requirement": "Anti-Money Laundering (AML)", "category": "financial_regulation"},
    {"requirement": "HMRC MTD Compliance", "category": "tax_compliance"}
]'::jsonb),

-- LAW
('legal', 'Legal Services', 'Law firms, legal practices, in-house legal teams',
'{
    "client": "client",
    "project": "matter",
    "meeting": "consultation",
    "employee": "solicitor",
    "deadline": "limitation date",
    "report": "case summary"
}'::jsonb,
'[
    "Matter management",
    "Document assembly",
    "Deadline tracking",
    "Time recording",
    "Conflict checking",
    "Court date management",
    "Client communication logging"
]'::jsonb,
'[
    {"requirement": "UK GDPR", "category": "data_protection"},
    {"requirement": "SRA Standards", "category": "professional_regulation"},
    {"requirement": "Legal Professional Privilege", "category": "confidentiality"},
    {"requirement": "Anti-Money Laundering (AML)", "category": "financial_regulation"}
]'::jsonb),

-- PROPERTY
('property', 'Real Estate & Property Management', 'Estate agents, property managers, letting agents',
'{
    "client": "landlord",
    "customer": "tenant",
    "project": "property",
    "meeting": "viewing",
    "employee": "agent",
    "deadline": "completion date",
    "report": "property report"
}'::jsonb,
'[
    "Property listing management",
    "Viewing scheduling",
    "Tenant screening",
    "Maintenance request handling",
    "Rent collection tracking",
    "Lease management",
    "Compliance certificate tracking"
]'::jsonb,
'[
    {"requirement": "UK GDPR", "category": "data_protection"},
    {"requirement": "Estate Agents Act 1979", "category": "industry_regulation"},
    {"requirement": "Tenant Fees Act 2019", "category": "tenant_protection"},
    {"requirement": "Right to Rent Checks", "category": "legal_compliance"}
]'::jsonb),

-- SUPPLY CHAIN
('supply_chain', 'Supply Chain & Logistics', 'Logistics companies, warehousing, freight forwarding, distribution',
'{
    "client": "customer",
    "project": "shipment",
    "meeting": "dispatch meeting",
    "employee": "coordinator",
    "deadline": "delivery date",
    "report": "tracking report"
}'::jsonb,
'[
    "Shipment tracking",
    "Inventory management",
    "Route optimization",
    "Carrier coordination",
    "Customs documentation",
    "Delivery scheduling",
    "Exception handling"
]'::jsonb,
'[
    {"requirement": "UK GDPR", "category": "data_protection"},
    {"requirement": "Customs Compliance", "category": "international_trade"},
    {"requirement": "Health & Safety Regulations", "category": "workplace_safety"},
    {"requirement": "ADR (Dangerous Goods)", "category": "transport_regulation"}
]'::jsonb),

-- EDUCATION
('education', 'Education & Charity', 'Universities, schools, student unions, charities, non-profits',
'{
    "client": "student",
    "customer": "member",
    "project": "initiative",
    "meeting": "committee meeting",
    "employee": "staff member",
    "deadline": "action deadline",
    "report": "update",
    "manager": "coordinator"
}'::jsonb,
'[
    "Event approval workflow",
    "Budget allocation",
    "Membership management",
    "Volunteer coordination",
    "Grant application support",
    "Committee management",
    "Safeguarding compliance",
    "Impact reporting"
]'::jsonb,
'[
    {"requirement": "UK GDPR", "category": "data_protection"},
    {"requirement": "Charity Commission Reporting", "category": "charity_compliance"},
    {"requirement": "Safeguarding Policy", "category": "welfare_compliance"},
    {"requirement": "DBS Check Requirements", "category": "personnel_vetting"}
]'::jsonb);

-- =====================================================
-- DEPARTMENT TEMPLATES - RECRUITMENT
-- =====================================================

INSERT INTO department_templates (industry_id, name, description, suggested_roles, display_order, is_required)
SELECT
    id,
    'Recruitment Team',
    'Core recruitment consultants and resourcers',
    '["Recruitment Consultant", "Senior Consultant", "Resourcer", "Talent Acquisition Specialist"]'::jsonb,
    1,
    true
FROM industries WHERE slug = 'recruitment';

INSERT INTO department_templates (industry_id, name, description, suggested_roles, display_order, is_required)
SELECT
    id,
    'Business Development',
    'Client acquisition and account management',
    '["Business Development Manager", "Account Manager", "Client Success Manager"]'::jsonb,
    2,
    false
FROM industries WHERE slug = 'recruitment';

INSERT INTO department_templates (industry_id, name, description, suggested_roles, display_order, is_required)
SELECT
    id,
    'Operations',
    'Back office support and compliance',
    '["Operations Manager", "Compliance Officer", "Administrator"]'::jsonb,
    3,
    false
FROM industries WHERE slug = 'recruitment';

-- =====================================================
-- DEPARTMENT TEMPLATES - ACCOUNTING
-- =====================================================

INSERT INTO department_templates (industry_id, name, description, suggested_roles, display_order, is_required)
SELECT
    id,
    'Accounts',
    'Core accounting and bookkeeping',
    '["Accountant", "Senior Accountant", "Bookkeeper", "Accounts Assistant"]'::jsonb,
    1,
    true
FROM industries WHERE slug = 'accounting';

INSERT INTO department_templates (industry_id, name, description, suggested_roles, display_order, is_required)
SELECT
    id,
    'Tax',
    'Tax compliance and advisory',
    '["Tax Manager", "Tax Advisor", "Tax Associate"]'::jsonb,
    2,
    false
FROM industries WHERE slug = 'accounting';

INSERT INTO department_templates (industry_id, name, description, suggested_roles, display_order, is_required)
SELECT
    id,
    'Audit',
    'Audit and assurance services',
    '["Audit Manager", "Auditor", "Audit Associate"]'::jsonb,
    3,
    false
FROM industries WHERE slug = 'accounting';

-- =====================================================
-- DEPARTMENT TEMPLATES - LEGAL
-- =====================================================

INSERT INTO department_templates (industry_id, name, description, suggested_roles, display_order, is_required)
SELECT
    id,
    'Fee Earners',
    'Partners and solicitors handling client matters',
    '["Partner", "Senior Associate", "Associate", "Solicitor", "Trainee Solicitor"]'::jsonb,
    1,
    true
FROM industries WHERE slug = 'legal';

INSERT INTO department_templates (industry_id, name, description, suggested_roles, display_order, is_required)
SELECT
    id,
    'Support',
    'Legal support and secretarial',
    '["Legal Secretary", "Paralegal", "Legal Executive"]'::jsonb,
    2,
    true
FROM industries WHERE slug = 'legal';

INSERT INTO department_templates (industry_id, name, description, suggested_roles, display_order, is_required)
SELECT
    id,
    'Practice Management',
    'Business operations and finance',
    '["Practice Manager", "Finance Manager", "Office Manager"]'::jsonb,
    3,
    false
FROM industries WHERE slug = 'legal';

-- =====================================================
-- DEPARTMENT TEMPLATES - PROPERTY
-- =====================================================

INSERT INTO department_templates (industry_id, name, description, suggested_roles, display_order, is_required)
SELECT
    id,
    'Sales',
    'Property sales team',
    '["Sales Director", "Senior Negotiator", "Sales Negotiator"]'::jsonb,
    1,
    true
FROM industries WHERE slug = 'property';

INSERT INTO department_templates (industry_id, name, description, suggested_roles, display_order, is_required)
SELECT
    id,
    'Lettings',
    'Lettings and tenant management',
    '["Lettings Manager", "Lettings Negotiator", "Property Manager"]'::jsonb,
    2,
    false
FROM industries WHERE slug = 'property';

INSERT INTO department_templates (industry_id, name, description, suggested_roles, display_order, is_required)
SELECT
    id,
    'Property Management',
    'Ongoing property maintenance and tenant relations',
    '["Property Manager", "Maintenance Coordinator", "Tenant Liaison"]'::jsonb,
    3,
    false
FROM industries WHERE slug = 'property';

-- =====================================================
-- DEPARTMENT TEMPLATES - SUPPLY CHAIN
-- =====================================================

INSERT INTO department_templates (industry_id, name, description, suggested_roles, display_order, is_required)
SELECT
    id,
    'Operations',
    'Day-to-day logistics coordination',
    '["Operations Manager", "Logistics Coordinator", "Dispatcher"]'::jsonb,
    1,
    true
FROM industries WHERE slug = 'supply_chain';

INSERT INTO department_templates (industry_id, name, description, suggested_roles, display_order, is_required)
SELECT
    id,
    'Warehouse',
    'Warehouse and inventory management',
    '["Warehouse Manager", "Stock Controller", "Warehouse Operative"]'::jsonb,
    2,
    false
FROM industries WHERE slug = 'supply_chain';

INSERT INTO department_templates (industry_id, name, description, suggested_roles, display_order, is_required)
SELECT
    id,
    'Customer Service',
    'Client communication and issue resolution',
    '["Customer Service Manager", "Customer Service Representative"]'::jsonb,
    3,
    false
FROM industries WHERE slug = 'supply_chain';

-- =====================================================
-- DEPARTMENT TEMPLATES - EDUCATION/CHARITY
-- =====================================================

INSERT INTO department_templates (industry_id, name, description, suggested_roles, display_order, is_required)
SELECT
    id,
    'Leadership',
    'Executive leadership and elected officers',
    '["President", "Vice President", "Elected Officer", "CEO", "Director"]'::jsonb,
    1,
    true
FROM industries WHERE slug = 'education';

INSERT INTO department_templates (industry_id, name, description, suggested_roles, display_order, is_required)
SELECT
    id,
    'Operations & Facilities',
    'Building management, events logistics, health & safety',
    '["Operations Manager", "Facilities Coordinator", "Events Officer", "Health & Safety Officer"]'::jsonb,
    2,
    true
FROM industries WHERE slug = 'education';

INSERT INTO department_templates (industry_id, name, description, suggested_roles, display_order, is_required)
SELECT
    id,
    'Student Activities',
    'Societies, clubs, volunteering, engagement',
    '["Activities Manager", "Societies Coordinator", "Sports Officer", "Volunteering Coordinator"]'::jsonb,
    3,
    false
FROM industries WHERE slug = 'education';

INSERT INTO department_templates (industry_id, name, description, suggested_roles, display_order, is_required)
SELECT
    id,
    'Student Voice & Representation',
    'Academic representation, campaigns, democracy',
    '["Student Voice Manager", "Representation Coordinator", "Campaigns Officer"]'::jsonb,
    4,
    false
FROM industries WHERE slug = 'education';

INSERT INTO department_templates (industry_id, name, description, suggested_roles, display_order, is_required)
SELECT
    id,
    'Welfare & Support',
    'Advice services, wellbeing, accessibility',
    '["Welfare Manager", "Advice Centre Manager", "Wellbeing Officer"]'::jsonb,
    5,
    false
FROM industries WHERE slug = 'education';

INSERT INTO department_templates (industry_id, name, description, suggested_roles, display_order, is_required)
SELECT
    id,
    'Finance & Administration',
    'Budgets, HR, compliance, governance',
    '["Finance Manager", "Finance Assistant", "HR Officer", "Governance Officer"]'::jsonb,
    6,
    true
FROM industries WHERE slug = 'education';

INSERT INTO department_templates (industry_id, name, description, suggested_roles, display_order, is_required)
SELECT
    id,
    'Marketing & Communications',
    'Digital, campaigns, design, internal comms',
    '["Marketing Manager", "Digital Content Officer", "Graphic Designer", "Communications Officer"]'::jsonb,
    7,
    false
FROM industries WHERE slug = 'education';

INSERT INTO department_templates (industry_id, name, description, suggested_roles, display_order, is_required)
SELECT
    id,
    'Commercial Services',
    'Shop, bar, catering, venue hire (if applicable)',
    '["Commercial Manager", "Bar Manager", "Retail Supervisor", "Catering Manager"]'::jsonb,
    8,
    false
FROM industries WHERE slug = 'education';

-- =====================================================
-- INTEGRATION TYPES
-- =====================================================

INSERT INTO integration_types (slug, name, description, category, is_active) VALUES
('microsoft_365', 'Microsoft 365', 'Calendar, email, and document integration via Microsoft Graph', 'productivity', true),
('google_workspace', 'Google Workspace', 'Calendar, email, and document integration via Google APIs', 'productivity', true),
('slack', 'Slack', 'Team messaging and notifications', 'communication', true),
('teams', 'Microsoft Teams', 'Team messaging and video calls', 'communication', true),
('quickbooks', 'QuickBooks Online', 'Accounting and invoicing', 'finance', true),
('xero', 'Xero', 'Accounting and invoicing', 'finance', true),
('stripe', 'Stripe', 'Payment processing', 'payments', true),
('zapier', 'Zapier', 'Workflow automation and app connections', 'automation', true),
('notion', 'Notion', 'Documentation and knowledge base', 'productivity', true),
('trello', 'Trello', 'Project and task management', 'project_management', true),
('asana', 'Asana', 'Project and task management', 'project_management', true),
('hubspot', 'HubSpot', 'CRM and marketing automation', 'crm', true),
('salesforce', 'Salesforce', 'CRM and sales automation', 'crm', true);

-- =====================================================
-- SYSTEM SETTINGS
-- =====================================================

INSERT INTO system_settings (key, value, description) VALUES
('onboarding_phases', '[
    {"number": 1, "slug": "identity", "name": "Identity Mirror", "description": "Organizational synthesis and neural handshake"},
    {"number": 2, "slug": "branding", "name": "Brand Architecture", "description": "Visual identity, nomenclature, tone"},
    {"number": 3, "slug": "deep_probe", "name": "Deep Probe", "description": "Contextual intelligence extraction"},
    {"number": 4, "slug": "structure_mapping", "name": "Structure Mapping", "description": "Hierarchical authority definition"},
    {"number": 5, "slug": "credential_layer", "name": "Credential Layer", "description": "Access control and permissions"},
    {"number": 6, "slug": "knowledge_base", "name": "Knowledge Base", "description": "Domain expertise integration"},
    {"number": 7, "slug": "vector_redlines", "name": "Vector Redlines", "description": "Decision-boundary calibration"},
    {"number": 8, "slug": "system_integration", "name": "System Integration", "description": "External tooling synchronization"},
    {"number": 9, "slug": "deployment", "name": "Deployment", "description": "Live-system activation"}
]'::jsonb, 'Onboarding phase configuration'),

('supported_file_types', '["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "md", "csv"]'::jsonb, 'Supported file types for knowledge base upload'),

('max_file_size_mb', '50'::jsonb, 'Maximum file size for uploads in MB'),

('password_policy', '{
    "min_length": 12,
    "require_uppercase": true,
    "require_lowercase": true,
    "require_number": true,
    "require_symbol": true
}'::jsonb, 'Password complexity requirements');

-- Industries and templates seeded successfully
