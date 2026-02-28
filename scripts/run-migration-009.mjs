import pg from 'pg';
import fs from 'fs';

const sql = fs.readFileSync('database/migrations/009_research_admin_agent.sql', 'utf8');

const client = new pg.Client({
  host: 'aws-0-eu-west-2.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres.urybzfsillbcpxkdzpuv',
  password: 'postgres',
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log('Connected to Supabase PostgreSQL');
  await client.query(sql);
  console.log('Migration 009 executed successfully');
} catch (err) {
  console.error('Migration failed:', err.message);
} finally {
  await client.end();
}
