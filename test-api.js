require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// We'll use the service role key to bypass auth for testing
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

async function testCalendarEndpoint(trapId, year, month) {
  console.log(`Testing calendar for trap ${trapId}, ${year}-${month}...`);
  
  // Let's replicate what the calendar endpoint does directly
  const { data: trap, error: trapErr } = await supabase
    .from('armadilhas')
    .select('id')
    .eq('identificador', trapId)
    .eq('ativo', true)
    .single();
    
  if (trapErr || !trap) {
    console.error('Trap not found');
    return;
  }
  
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  
  console.log(`Querying between ${start.toISOString()} and ${end.toISOString()}`);
  
  const { data: captures, error: capErr } = await supabase
    .from('capturas')
    .select('capturada_em, total_insetos, insetos_novos, nivel')
    .eq('armadilha_id', trap.id)
    // We removed this line! .eq('ciclo_fita_id', activeCycle.id)
    .gte('capturada_em', start.toISOString())
    .lt('capturada_em', end.toISOString())
    .order('capturada_em', { ascending: true });
    
  if (capErr) {
    console.error('Error fetching captures:', capErr);
    return;
  }
  
  console.log(`Found ${captures.length} captures for this month!`);
  console.log('Sample:');
  captures.slice(0, 5).forEach(c => console.log(c));
}

testCalendarEndpoint('SPY-07', 2026, 5).catch(console.error);
