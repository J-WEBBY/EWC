// Quick script to verify Deep Probe database tables exist
import { createSovereignClient } from '../src/lib/supabase/service';

async function verifyTables() {
  const sovereign = createSovereignClient();

  const tables = [
    'deep_probe_conversations',
    'deep_probe_messages',
    'deep_probe_insights',
    'deep_probe_workflows',
    'deep_probe_values'
  ];

  console.log('🔍 Checking Deep Probe database tables...\n');

  for (const table of tables) {
    try {
      const { error, count } = await sovereign
        .from(table as any)
        .select('*', { count: 'exact', head: true });

      if (error) {
        console.log(`❌ ${table}: NOT FOUND`);
        console.log(`   Error: ${error.message}\n`);
      } else {
        console.log(`✅ ${table}: EXISTS (${count || 0} rows)\n`);
      }
    } catch (err) {
      console.log(`❌ ${table}: ERROR`);
      console.log(`   ${err}\n`);
    }
  }
}

verifyTables().catch(console.error);
