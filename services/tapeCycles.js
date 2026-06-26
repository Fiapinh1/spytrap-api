async function getActiveTapeCycle(supabase, armadilhaId) {
  const { data, error } = await supabase
    .from('ciclos_fita')
    .select('*')
    .eq('armadilha_id', armadilhaId)
    .eq('status', 'ativo')
    .order('iniciado_em', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function ensureActiveTapeCycle(supabase, armadilhaId, startedAt = new Date().toISOString()) {
  const active = await getActiveTapeCycle(supabase, armadilhaId);
  if (active) return active;

  const { data, error } = await supabase
    .from('ciclos_fita')
    .insert([{
      armadilha_id: armadilhaId,
      iniciado_em: startedAt,
      status: 'ativo',
    }])
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

async function getTapeCycleForTimestamp(supabase, armadilhaId, timestamp) {
  const { data, error } = await supabase
    .from('ciclos_fita')
    .select('*')
    .eq('armadilha_id', armadilhaId)
    .lte('iniciado_em', timestamp)
    .or(`encerrado_em.is.null,encerrado_em.gt.${timestamp}`)
    .order('iniciado_em', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function calculateNewInsectsForCycle(supabase, cicloFitaId, totalInsetos, capturedAt = null) {
  let query = supabase
    .from('capturas')
    .select('total_insetos')
    .eq('ciclo_fita_id', cicloFitaId)
    .order('total_insetos', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (capturedAt) {
    query = query.lt('capturada_em', capturedAt);
  }

  const { data, error } = await query;

  if (error) throw error;
  return Math.max((Number(totalInsetos) || 0) - (Number(data?.total_insetos) || 0), 0);
}

async function replaceActiveTapeCycle(supabase, armadilhaId, changedAt = new Date().toISOString()) {
  return registerTapeChange(supabase, armadilhaId, changedAt);
}

async function registerTapeChange(supabase, armadilhaId, changedAt, note = null) {
  const { data, error } = await supabase.rpc('registrar_troca_fita', {
    p_armadilha_id: armadilhaId,
    p_effective_at: changedAt,
    p_observacao: note,
  });

  if (error) throw error;
  return {
    previous: data?.previous || null,
    current: data?.current || null,
    movedCaptures: Number(data?.movedCaptures) || 0,
  };
}

module.exports = {
  calculateNewInsectsForCycle,
  ensureActiveTapeCycle,
  getActiveTapeCycle,
  getTapeCycleForTimestamp,
  registerTapeChange,
  replaceActiveTapeCycle,
};
