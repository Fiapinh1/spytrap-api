const express          = require('express');
const { createClient } = require('@supabase/supabase-js');
const authMiddleware   = require('../middleware/authMiddleware');

const router   = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── HELPER: normaliza insetos/dia → intensidade 0.0–1.0 ───────
function calcIntensidade(mediaDiaria) {
  if (mediaDiaria <= 0)  return 0.0;
  if (mediaDiaria <= 3)  return 0.15;
  if (mediaDiaria <= 7)  return 0.45;
  if (mediaDiaria <= 12) return 0.75;
  return 1.0;
}

// ════════════════════════════════════════════════════════════
//  GET /api/heatmap
//  Query: startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
//  Retorna pontos de calor para todas as armadilhas no período.
// ════════════════════════════════════════════════════════════
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(422).json({
        error: 'parametros_obrigatorios',
        message: 'startDate e endDate são obrigatórios.',
      });
    }

    // Busca todas as armadilhas ativas
    const { data: armadilhas, error: errArm } = await supabase
      .from('armadilhas')
      .select('id, identificador, nome, latitude, longitude, status')
      .eq('ativo', true);

    if (errArm) throw errArm;

    // Para cada armadilha, agrega capturas do período
    const pontos = await Promise.all(armadilhas.map(async trap => {
      const { data: caps } = await supabase
        .from('capturas')
        .select('capturada_em, total_insetos')
        .eq('armadilha_id', trap.id)
        .gte('capturada_em', startDate + 'T00:00:00Z')
        .lte('capturada_em', endDate   + 'T23:59:59Z');

      const totalInsetos  = (caps || []).reduce((s, c) => s + c.total_insetos, 0);
      const diasSet       = new Set((caps || []).map(c => c.capturada_em.substring(0, 10)));
      const totalDias     = diasSet.size;
      const media         = totalDias > 0 ? totalInsetos / totalDias : 0;

      return {
        id:           trap.identificador,
        name:         trap.nome,
        lat:          parseFloat(trap.latitude),
        lng:          parseFloat(trap.longitude),
        status:       trap.status,
        totalInsetos,
        totalDias,
        mediaDiaria:  parseFloat(media.toFixed(1)),
        intensidade:  calcIntensidade(media),
      };
    }));

    return res.json(pontos);

  } catch (err) {
    console.error('GET /heatmap:', err.message);
    return res.status(500).json({ error: 'erro_servidor', message: 'Erro ao gerar mapa de calor.' });
  }
});

// ════════════════════════════════════════════════════════════
//  GET /api/heatmap/timeline
//  Query: trapId=SPY-01&days=30
//  Retorna série temporal: insetos por dia (para gráfico).
// ════════════════════════════════════════════════════════════
router.get('/timeline', authMiddleware, async (req, res) => {
  try {
    const { trapId, days = 30 } = req.query;

    const { data: trap } = await supabase
      .from('armadilhas')
      .select('id')
      .eq('identificador', trapId)
      .eq('ativo', true)
      .single();

    if (!trap) return res.status(404).json({ error: 'nao_encontrada' });

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const { data: caps } = await supabase
      .from('capturas')
      .select('capturada_em, total_insetos, nivel')
      .eq('armadilha_id', trap.id)
      .gte('capturada_em', startDate.toISOString())
      .order('capturada_em', { ascending: true });

    const porDia = {};
    (caps || []).forEach(cap => {
      const dia = cap.capturada_em.substring(0, 10);
      porDia[dia] = (porDia[dia] || 0) + cap.total_insetos;
    });

    return res.json(
      Object.entries(porDia).map(([date, total]) => ({ date, total }))
    );

  } catch (err) {
    console.error('GET /heatmap/timeline:', err.message);
    return res.status(500).json({ error: 'erro_servidor', message: 'Erro ao gerar timeline.' });
  }
});

module.exports = router;