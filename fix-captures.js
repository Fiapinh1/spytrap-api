require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

async function main() {
  console.log('Checking for captures without ciclo_fita_id...');

  // Get all traps
  const { data: traps, error: trapsError } = await supabase
    .from('armadilhas')
    .select('*')
    .eq('ativo', true);

  if (trapsError) {
    console.error('Error fetching traps:', trapsError);
    return;
  }

  for (const trap of traps) {
    console.log(`Processing trap: ${trap.identificador} (${trap.id})`);

    // Get all cycles for the trap, ordered by started_at descending
    const { data: cycles, error: cyclesError } = await supabase
      .from('ciclos_fita')
      .select('*')
      .eq('armadilha_id', trap.id)
      .order('iniciado_em', { ascending: true });

    if (cyclesError) {
      console.error(`Error fetching cycles for trap ${trap.identificador}:`, cyclesError);
      continue;
    }

    // Get all captures without ciclo_fita_id for the trap
    const { data: captures, error: capturesError } = await supabase
      .from('capturas')
      .select('*')
      .eq('armadilha_id', trap.id)
      .is('ciclo_fita_id', null)
      .order('capturada_em', { ascending: true });

    if (capturesError) {
      console.error(`Error fetching captures for trap ${trap.identificador}:`, capturesError);
      continue;
    }

    if (captures.length === 0) {
      console.log(`No captures without ciclo_fita_id for trap ${trap.identificador}`);
      continue;
    }

    console.log(`Found ${captures.length} captures without ciclo_fita_id for trap ${trap.identificador}`);

    // For each capture, find which cycle it belongs to
    const updates = [];
    for (const capture of captures) {
      const captureDate = new Date(capture.capturada_em);
      
      // Find the appropriate cycle for this capture
      let targetCycle = null;
      
      // Iterate cycles to find the one that contains the capture date
      for (let i = 0; i < cycles.length; i++) {
        const cycle = cycles[i];
        const cycleStart = new Date(cycle.iniciado_em);
        
        // Check if this is the last (active) cycle
        if (i === cycles.length - 1) {
          if (captureDate >= cycleStart) {
            targetCycle = cycle;
            break;
          }
        } else {
          const nextCycle = cycles[i + 1];
          const nextCycleStart = new Date(nextCycle.iniciado_em);
          
          if (captureDate >= cycleStart && captureDate < nextCycleStart) {
            targetCycle = cycle;
            break;
          }
        }
      }
      
      // If no cycle found, create an initial cycle
      if (!targetCycle) {
        if (cycles.length === 0) {
          // No cycles at all, create one starting before the first capture
          const firstCaptureDate = new Date(captures[0].capturada_em);
          firstCaptureDate.setDate(firstCaptureDate.getDate() - 1);
          
          const { data: newCycle, error: newCycleError } = await supabase
            .from('ciclos_fita')
            .insert([{
              armadilha_id: trap.id,
              iniciado_em: firstCaptureDate.toISOString(),
              status: 'encerrado',
              encerrado_em: new Date().toISOString()
            }])
            .select('*')
            .single();
            
          if (newCycleError) {
            console.error(`Error creating initial cycle for trap ${trap.identificador}:`, newCycleError);
            continue;
          }
          
          targetCycle = newCycle;
          cycles.push(newCycle); // Add to cycles array for future captures
        } else {
          // Use the first cycle as fallback
          targetCycle = cycles[0];
        }
      }
      
      updates.push({
        id: capture.id,
        ciclo_fita_id: targetCycle.id
      });
    }

    // Update all captures
    for (const update of updates) {
      const { error } = await supabase
        .from('capturas')
        .update({ ciclo_fita_id: update.ciclo_fita_id })
        .eq('id', update.id);

      if (error) {
        console.error(`Error updating capture ${update.id}:`, error);
      } else {
        console.log(`Updated capture ${update.id} with cycle ${update.ciclo_fita_id}`);
      }
    }
  }

  console.log('Done!');
}

main().catch(console.error);
