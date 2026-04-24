<<<<<<< HEAD
const express          = require('express');
const { createClient } = require('@supabase/supabase-js');
const authMiddleware   = require('../middleware/authMiddleware');

const router   = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── HELPER: calcula tendência comparando 2 metades do período ─
function calcTendencia(porDia) {
  const datas   = Object.keys(porDia).sort();
  const metade  = Math.floor(datas.length / 2);
  if (metade === 0) return 'estável';
  const primeiraM = datas.slice(0, metade).reduce((s, d) => s + porDia[d], 0);
  const segundaM  = datas.slice(metade).reduce((s, d)  => s + porDia[d], 0);
  if (segundaM > primeiraM * 1.1) return 'subindo';
  if (segundaM < primeiraM * 0.9) return 'caindo';
  return 'estável';
}

// ════════════════════════════════════════════════════════════
//  GET /api/reports/summary
//  Query: trapId=SPY-01&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
//  Retorna KPIs + dados por dia (para gráficos).
// ════════════════════════════════════════════════════════════
router.get('/summary', authMiddleware, async (req, res) => {
  try {
    const { trapId, startDate, endDate } = req.query;

    if (!trapId || !startDate || !endDate) {
      return res.status(422).json({
        error: 'parametros_obrigatorios',
        message: 'trapId, startDate e endDate são obrigatórios.',
      });
    }

    const { data: trap } = await supabase
      .from('armadilhas')
      .select('id, identificador, nome, status, latitude, longitude')
      .eq('identificador', trapId)
      .eq('ativo', true)
      .single();

    if (!trap) return res.status(404).json({ error: 'nao_encontrada' });

    const { data: capturas } = await supabase
      .from('capturas')
      .select('capturada_em, total_insetos, nivel, confianca_ia')
      .eq('armadilha_id', trap.id)
      .gte('capturada_em', startDate + 'T00:00:00Z')
      .lte('capturada_em', endDate   + 'T23:59:59Z')
      .order('capturada_em', { ascending: true });

    const caps = capturas || [];

    // KPIs
    const totalInsetos  = caps.reduce((s, c) => s + c.total_insetos, 0);
    const picoInsetos   = caps.length ? Math.max(...caps.map(c => c.total_insetos)) : 0;
    const capturasAlta  = caps.filter(c => c.nivel === 'high');
    const porDia        = {};

    caps.forEach(cap => {
      const dia = cap.capturada_em.substring(0, 10);
      porDia[dia] = (porDia[dia] || 0) + cap.total_insetos;
    });

    const diasMonitorados = Object.keys(porDia).length;
    const mediaDiaria     = diasMonitorados > 0
      ? parseFloat((totalInsetos / diasMonitorados).toFixed(1)) : 0;

    // Top 5 piores capturas
    const top5 = [...caps]
      .sort((a, b) => b.total_insetos - a.total_insetos)
      .slice(0, 5)
      .map(c => ({
        data:       c.capturada_em.substring(0, 10),
        hora:       c.capturada_em.substring(11, 16),
        total:      c.total_insetos,
        nivel:      c.nivel,
        confianca:  c.confianca_ia,
      }));

    return res.json({
      trap: {
        id:        trap.identificador,
        nome:      trap.nome,
        status:    trap.status,
        latitude:  parseFloat(trap.latitude),
        longitude: parseFloat(trap.longitude),
      },
      periodo:      { startDate, endDate },
      kpis: {
        totalInsetos,
        totalCapturas:   caps.length,
        picoInsetos,
        diasMonitorados,
        diasAlta:        new Set(capturasAlta.map(c => c.capturada_em.substring(0, 10))).size,
        mediaDiaria,
        tendencia:       calcTendencia(porDia),
      },
      porDia,
      top5,
    });

  } catch (err) {
    console.error('GET /reports/summary:', err.message);
    return res.status(500).json({ error: 'erro_servidor', message: 'Erro ao gerar relatório.' });
  }
});

// ════════════════════════════════════════════════════════════
//  GET /api/reports/comparison
//  Query: startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
//  Compara todas as armadilhas no período.
// ════════════════════════════════════════════════════════════
router.get('/comparison', authMiddleware, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(422).json({
        error: 'parametros_obrigatorios',
        message: 'startDate e endDate são obrigatórios.',
      });
    }

    const { data: armadilhas } = await supabase
      .from('armadilhas')
      .select('id, identificador, nome, status, latitude, longitude')
      .eq('ativo', true)
      .order('identificador');

    const resultados = await Promise.all((armadilhas || []).map(async trap => {
      const { data: caps } = await supabase
        .from('capturas')
        .select('capturada_em, total_insetos, nivel')
        .eq('armadilha_id', trap.id)
        .gte('capturada_em', startDate + 'T00:00:00Z')
        .lte('capturada_em', endDate   + 'T23:59:59Z');

      const c            = caps || [];
      const totalInsetos = c.reduce((s, x) => s + x.total_insetos, 0);
      const diasSet      = new Set(c.map(x => x.capturada_em.substring(0, 10)));

      return {
        id:              trap.identificador,
        nome:            trap.nome,
        status:          trap.status,
        lat:             parseFloat(trap.latitude),
        lng:             parseFloat(trap.longitude),
        totalInsetos,
        totalCapturas:   c.length,
        diasMonitorados: diasSet.size,
        diasAlta:        c.filter(x => x.nivel === 'high').length,
        mediaDiaria:     diasSet.size > 0
          ? parseFloat((totalInsetos / diasSet.size).toFixed(1)) : 0,
      };
    }));

    return res.json(
      resultados.sort((a, b) => b.totalInsetos - a.totalInsetos)
    );

  } catch (err) {
    console.error('GET /reports/comparison:', err.message);
    return res.status(500).json({ error: 'erro_servidor', message: 'Erro ao gerar comparativo.' });
  }
});

// ════════════════════════════════════════════════════════════
//  GET /api/reports/captures
//  Query: trapId=SPY-01&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
//  Lista bruta de capturas para exportação CSV.
// ════════════════════════════════════════════════════════════
router.get('/captures', authMiddleware, async (req, res) => {
  try {
    const { trapId, startDate, endDate } = req.query;

    const { data: trap } = await supabase
      .from('armadilhas')
      .select('id, identificador, nome')
      .eq('identificador', trapId)
      .single();

    if (!trap) return res.status(404).json({ error: 'nao_encontrada' });

    const { data: caps } = await supabase
      .from('capturas')
      .select('capturada_em, total_insetos, nivel, confianca_ia, imagem_url')
      .eq('armadilha_id', trap.id)
      .gte('capturada_em', startDate + 'T00:00:00Z')
      .lte('capturada_em', endDate   + 'T23:59:59Z')
      .order('capturada_em', { ascending: true });

    return res.json({
      trap: { id: trap.identificador, nome: trap.nome },
      captures: (caps || []).map(c => ({
        data:       c.capturada_em.substring(0, 10),
        hora:       c.capturada_em.substring(11, 16),
        insetos:    c.total_insetos,
        nivel:      c.nivel,
        confianca:  c.confianca_ia,
        imagem:     c.imagem_url,
      })),
    });

  } catch (err) {
    console.error('GET /reports/captures:', err.message);
    return res.status(500).json({ error: 'erro_servidor', message: 'Erro ao listar capturas.' });
  }
});

=======
const express          = require('express');
const { createClient } = require('@supabase/supabase-js');
const authMiddleware   = require('../middleware/authMiddleware');

const router   = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── HELPER: calcula tendência comparando 2 metades do período ─
function calcTendencia(porDia) {
  const datas   = Object.keys(porDia).sort();
  const metade  = Math.floor(datas.length / 2);
  if (metade === 0) return 'estável';
  const primeiraM = datas.slice(0, metade).reduce((s, d) => s + porDia[d], 0);
  const segundaM  = datas.slice(metade).reduce((s, d)  => s + porDia[d], 0);
  if (segundaM > primeiraM * 1.1) return 'subindo';
  if (segundaM < primeiraM * 0.9) return 'caindo';
  return 'estável';
}

// ════════════════════════════════════════════════════════════
//  GET /api/reports/summary
//  Query: trapId=SPY-01&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
//  Retorna KPIs + dados por dia (para gráficos).
// ════════════════════════════════════════════════════════════
router.get('/summary', authMiddleware, async (req, res) => {
  try {
    const { trapId, startDate, endDate } = req.query;

    if (!trapId || !startDate || !endDate) {
      return res.status(422).json({
        error: 'parametros_obrigatorios',
        message: 'trapId, startDate e endDate são obrigatórios.',
      });
    }

    const { data: trap } = await supabase
      .from('armadilhas')
      .select('id, identificador, nome, status, latitude, longitude')
      .eq('identificador', trapId)
      .eq('ativo', true)
      .single();

    if (!trap) return res.status(404).json({ error: 'nao_encontrada' });

    const { data: capturas } = await supabase
      .from('capturas')
      .select('capturada_em, total_insetos, nivel, confianca_ia')
      .eq('armadilha_id', trap.id)
      .gte('capturada_em', startDate + 'T00:00:00Z')
      .lte('capturada_em', endDate   + 'T23:59:59Z')
      .order('capturada_em', { ascending: true });

    const caps = capturas || [];

    // KPIs
    const totalInsetos  = caps.reduce((s, c) => s + c.total_insetos, 0);
    const picoInsetos   = caps.length ? Math.max(...caps.map(c => c.total_insetos)) : 0;
    const capturasAlta  = caps.filter(c => c.nivel === 'high');
    const porDia        = {};

    caps.forEach(cap => {
      const dia = cap.capturada_em.substring(0, 10);
      porDia[dia] = (porDia[dia] || 0) + cap.total_insetos;
    });

    const diasMonitorados = Object.keys(porDia).length;
    const mediaDiaria     = diasMonitorados > 0
      ? parseFloat((totalInsetos / diasMonitorados).toFixed(1)) : 0;

    // Top 5 piores capturas
    const top5 = [...caps]
      .sort((a, b) => b.total_insetos - a.total_insetos)
      .slice(0, 5)
      .map(c => ({
        data:       c.capturada_em.substring(0, 10),
        hora:       c.capturada_em.substring(11, 16),
        total:      c.total_insetos,
        nivel:      c.nivel,
        confianca:  c.confianca_ia,
      }));

    return res.json({
      trap: {
        id:        trap.identificador,
        nome:      trap.nome,
        status:    trap.status,
        latitude:  parseFloat(trap.latitude),
        longitude: parseFloat(trap.longitude),
      },
      periodo:      { startDate, endDate },
      kpis: {
        totalInsetos,
        totalCapturas:   caps.length,
        picoInsetos,
        diasMonitorados,
        diasAlta:        new Set(capturasAlta.map(c => c.capturada_em.substring(0, 10))).size,
        mediaDiaria,
        tendencia:       calcTendencia(porDia),
      },
      porDia,
      top5,
    });

  } catch (err) {
    console.error('GET /reports/summary:', err.message);
    return res.status(500).json({ error: 'erro_servidor', message: 'Erro ao gerar relatório.' });
  }
});

// ════════════════════════════════════════════════════════════
//  GET /api/reports/comparison
//  Query: startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
//  Compara todas as armadilhas no período.
// ════════════════════════════════════════════════════════════
router.get('/comparison', authMiddleware, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(422).json({
        error: 'parametros_obrigatorios',
        message: 'startDate e endDate são obrigatórios.',
      });
    }

    const { data: armadilhas } = await supabase
      .from('armadilhas')
      .select('id, identificador, nome, status, latitude, longitude')
      .eq('ativo', true)
      .order('identificador');

    const resultados = await Promise.all((armadilhas || []).map(async trap => {
      const { data: caps } = await supabase
        .from('capturas')
        .select('capturada_em, total_insetos, nivel')
        .eq('armadilha_id', trap.id)
        .gte('capturada_em', startDate + 'T00:00:00Z')
        .lte('capturada_em', endDate   + 'T23:59:59Z');

      const c            = caps || [];
      const totalInsetos = c.reduce((s, x) => s + x.total_insetos, 0);
      const diasSet      = new Set(c.map(x => x.capturada_em.substring(0, 10)));

      return {
        id:              trap.identificador,
        nome:            trap.nome,
        status:          trap.status,
        lat:             parseFloat(trap.latitude),
        lng:             parseFloat(trap.longitude),
        totalInsetos,
        totalCapturas:   c.length,
        diasMonitorados: diasSet.size,
        diasAlta:        c.filter(x => x.nivel === 'high').length,
        mediaDiaria:     diasSet.size > 0
          ? parseFloat((totalInsetos / diasSet.size).toFixed(1)) : 0,
      };
    }));

    return res.json(
      resultados.sort((a, b) => b.totalInsetos - a.totalInsetos)
    );

  } catch (err) {
    console.error('GET /reports/comparison:', err.message);
    return res.status(500).json({ error: 'erro_servidor', message: 'Erro ao gerar comparativo.' });
  }
});

// ════════════════════════════════════════════════════════════
//  GET /api/reports/captures
//  Query: trapId=SPY-01&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
//  Lista bruta de capturas para exportação CSV.
// ════════════════════════════════════════════════════════════
router.get('/captures', authMiddleware, async (req, res) => {
  try {
    const { trapId, startDate, endDate } = req.query;

    const { data: trap } = await supabase
      .from('armadilhas')
      .select('id, identificador, nome')
      .eq('identificador', trapId)
      .single();

    if (!trap) return res.status(404).json({ error: 'nao_encontrada' });

    const { data: caps } = await supabase
      .from('capturas')
      .select('capturada_em, total_insetos, nivel, confianca_ia, imagem_url')
      .eq('armadilha_id', trap.id)
      .gte('capturada_em', startDate + 'T00:00:00Z')
      .lte('capturada_em', endDate   + 'T23:59:59Z')
      .order('capturada_em', { ascending: true });

    return res.json({
      trap: { id: trap.identificador, nome: trap.nome },
      captures: (caps || []).map(c => ({
        data:       c.capturada_em.substring(0, 10),
        hora:       c.capturada_em.substring(11, 16),
        insetos:    c.total_insetos,
        nivel:      c.nivel,
        confianca:  c.confianca_ia,
        imagem:     c.imagem_url,
      })),
    });

  } catch (err) {
    console.error('GET /reports/captures:', err.message);
    return res.status(500).json({ error: 'erro_servidor', message: 'Erro ao listar capturas.' });
  }
});

>>>>>>> b094c2f (Atualiza front-end para integração com imagens do Supabase)
module.exports = router;