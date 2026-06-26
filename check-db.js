require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

async function main() {
  console.log('Checking database...');
  
  // Check traps
  const { data: traps, error: trapsErr } = await supabase
    .from('armadilhas')
    .select('*')
    .eq('ativo', true);
  
  if (trapsErr) {
    console.error('Error fetching traps:', trapsErr);
    return;
  }
  
  console.log(`Found ${traps.length} traps:`);
  traps.forEach(t => console.log(`- ${t.identificador} (${t.id})`));
  
  for (const trap of traps) {
    // Check cycles for this trap
    const { data: cycles, error: cyclesErr } = await supabase
      .from('ciclos_fita')
      .select('*')
      .eq('armadilha_id', trap.id)
      .order('iniciado_em', { ascending: true });
      
    if (cyclesErr) {
      console.error(`Error fetching cycles for trap ${trap.identificador}:`, cyclesErr);
      continue;
    }
    console.log(`\nTrap ${trap.identificador} has ${cycles.length} tape cycles`);
    cycles.forEach(c => console.log(`  - ${c.id} started at ${c.iniciado_em}, status: ${c.status}`));
    
    // Check all captures for this trap
    const { data: captures, error: capturesErr } = await supabase
      .from('capturas')
      .select('id, armadilha_id, ciclo_fita_id, capturada_em, total_insetos, insetos_novos')
      .eq('armadilha_id', trap.id)
      .order('capturada_em', { ascending: true });
      
    if (capturesErr) {
      console.error(`Error fetching captures for trap ${trap.identificador}:`, capturesErr);
      continue;
    }
    
    console.log(`Trap ${trap.identificador} has ${captures.length} total captures`);
    
    // Count captures with null ciclo_fita_id
    const nullCycleCount = captures.filter(c => !c.ciclo_fita_id).length;
    if (nullCycleCount > 0) {
      console.warn(`⚠️  ${nullCycleCount} captures have null ciclo_fita_id!`);
    }
    
    // Show some sample captures
    console.log('Sample captures (first 5):');
    captures.slice(0, 5).forEach(c => {
      console.log(`  - ID: ${c.id}, Date: ${c.capturada_em}, Cycle: ${c.ciclo_fita_id || 'NULL'}, Total: ${c.total_insetos}`);
    });
  }
}

main().catch(console.error);
