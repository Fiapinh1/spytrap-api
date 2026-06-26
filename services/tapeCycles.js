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

async function calculateNewInsectsForCycle(supabase, cicloFitaId, totalInsetos) {
  const { data, error } = await supabase
    .from('capturas')
    .select('total_insetos')
    .eq('ciclo_fita_id', cicloFitaId)
    .order('total_insetos', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return Math.max((Number(totalInsetos) || 0) - (Number(data?.total_insetos) || 0), 0);
}

async function replaceActiveTapeCycle(supabase, armadilhaId, changedAt = new Date().toISOString()) {
  const active = await getActiveTapeCycle(supabase, armadilhaId);

  if (active) {
    const { error: closeError } = await supabase
      .from('ciclos_fita')
      .update({
        status: 'encerrado',
        encerrado_em: changedAt,
        atualizado_em: changedAt,
      })
      .eq('id', active.id);

    if (closeError) throw closeError;
  }

  const { data, error } = await supabase
    .from('ciclos_fita')
    .insert([{
      armadilha_id: armadilhaId,
      iniciado_em: changedAt,
      status: 'ativo',
    }])
    .select('*')
    .single();

  if (error) throw error;
  return { previous: active || null, current: data };
}

module.exports = {
  calculateNewInsectsForCycle,
  ensureActiveTapeCycle,
  getActiveTapeCycle,
  replaceActiveTapeCycle,
};
