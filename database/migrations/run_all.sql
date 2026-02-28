-- =====================================================
-- JWEBLY SYSTEM - Run All Migrations
-- Execute this file in Supabase SQL Editor
-- =====================================================

-- WARNING: This will DELETE ALL EXISTING DATA
-- Make sure you have backups if needed

\echo '=================================================='
\echo 'JWEBLY SYSTEM - Database Migration'
\echo '=================================================='
\echo ''

\echo 'Step 1/4: Dropping existing tables...'
\ir 001_drop_existing.sql

\echo 'Step 2/4: Creating new schema...'
\ir 002_create_schema.sql

\echo 'Step 3/4: Seeding industries and templates...'
\ir 003_seed_industries.sql

\echo 'Step 4/4: Seeding University of Oldbury test data...'
\ir 004_seed_university_oldbury.sql

\echo ''
\echo '=================================================='
\echo 'Migration Complete!'
\echo '=================================================='
\echo ''
\echo 'Test Tenant Details:'
\echo '  Company: University of Oldbury Students'' Guild'
\echo '  Activation Key: JWEBLY-DEMO-2026'
\echo '  Admin Email: joe@uoo.co.uk'
\echo '  Industry: Education & Charity'
\echo '  Staff Members: 19'
\echo '  Departments: 8'
\echo ''
