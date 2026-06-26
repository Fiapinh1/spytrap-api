const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const authMiddleware = require('../middleware/authMiddleware');
const { ensureActiveTapeCycle } = require('../services/tapeCycles');

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

function calcTendencia(porDia) {
  const datas = Object.keys(porDia).sort();
  const metade = Math.floor(datas.length / 2);
  if (metade === 0) return 'estável';
  const primeiraM = datas.slice(0, metade).reduce((soma, data) => soma + porDia[data], 0);
  const segundaM = datas.slice(metade).reduce((soma, data) => soma + porDia[data], 0);
  if (segundaM > primeiraM * 1.1) return 'subindo';
  if (segundaM < primeiraM * 0.9) return 'caindo';
  return 'estável';
}

function novosInsetos(item) {
  return Number(item.insetos_novos ?? item.total_insetos) || 0;
}

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
    const activeCycle = await ensureActiveTapeCycle(supabase, trap.id);

    const { data: capturas } = await supabase
      .from('capturas')
      .select('capturada_em, total_insetos, insetos_novos, nivel, confianca_ia')
      .eq('armadilha_id', trap.id)
      .gte('capturada_em', `${startDate}T00:00:00Z`)
      .lte('capturada_em', `${endDate}T23:59:59Z`)
      .order('capturada_em', { ascending: true });

    const caps = capturas || [];
    const totalInsetos = caps.reduce((soma, item) => soma + novosInsetos(item), 0);
    const picoInsetos = caps.length ? Math.max(...caps.map(novosInsetos)) : 0;
    const capturasAlta = caps.filter((item) => item.nivel === 'high');
    const porDia = {};

    caps.forEach((cap) => {
      const dia = cap.capturada_em.substring(0, 10);
      porDia[dia] = (porDia[dia] || 0) + novosInsetos(cap);
    });

    const diasMonitorados = Object.keys(porDia).length;
    const mediaDiaria = diasMonitorados > 0
      ? parseFloat((totalInsetos / diasMonitorados).toFixed(1))
      : 0;

    const top5 = [...caps]
      .sort((a, b) => novosInsetos(b) - novosInsetos(a))
      .slice(0, 5)
      .map((item) => ({
        data: item.capturada_em.substring(0, 10),
        hora: item.capturada_em.substring(11, 16),
        total: novosInsetos(item),
        nivel: item.nivel,
        confianca: item.confianca_ia,
      }));

    return res.json({
      trap: {
        id: trap.identificador,
        nome: trap.nome,
        status: trap.status,
        latitude: parseFloat(trap.latitude),
        longitude: parseFloat(trap.longitude),
      },
      periodo: { startDate, endDate },
      kpis: {
        totalInsetos,
        totalCapturas: caps.length,
        picoInsetos,
        diasMonitorados,
        diasAlta: new Set(capturasAlta.map((item) => item.capturada_em.substring(0, 10))).size,
        mediaDiaria,
        tendencia: calcTendencia(porDia),
      },
      porDia,
      top5,
    });
  } catch (err) {
    console.error('GET /reports/summary:', err.message);
    return res.status(500).json({
      error: 'erro_servidor',
      message: 'Erro ao gerar relatório.',
    });
  }
});

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

    const resultados = await Promise.all((armadilhas || []).map(async (trap) => {
      const { data: caps } = await supabase
        .from('capturas')
        .select('capturada_em, total_insetos, insetos_novos, nivel')
        .eq('armadilha_id', trap.id)
        .eq('ciclo_fita_id', (await ensureActiveTapeCycle(supabase, trap.id)).id)
        .gte('capturada_em', `${startDate}T00:00:00Z`)
        .lte('capturada_em', `${endDate}T23:59:59Z`);

      const lista = caps || [];
      const totalInsetos = lista.reduce((soma, item) => soma + novosInsetos(item), 0);
      const diasSet = new Set(lista.map((item) => item.capturada_em.substring(0, 10)));

      return {
        id: trap.identificador,
        nome: trap.nome,
        status: trap.status,
        lat: parseFloat(trap.latitude),
        lng: parseFloat(trap.longitude),
        totalInsetos,
        totalCapturas: lista.length,
        diasMonitorados: diasSet.size,
        diasAlta: lista.filter((item) => item.nivel === 'high').length,
        mediaDiaria: diasSet.size > 0
          ? parseFloat((totalInsetos / diasSet.size).toFixed(1))
          : 0,
      };
    }));

    return res.json(resultados.sort((a, b) => b.totalInsetos - a.totalInsetos));
  } catch (err) {
    console.error('GET /reports/comparison:', err.message);
    return res.status(500).json({
      error: 'erro_servidor',
      message: 'Erro ao gerar comparativo.',
    });
  }
});

router.get('/captures', authMiddleware, async (req, res) => {
  try {
    const { trapId, startDate, endDate } = req.query;

    const { data: trap } = await supabase
      .from('armadilhas')
      .select('id, identificador, nome')
      .eq('identificador', trapId)
      .single();

    if (!trap) return res.status(404).json({ error: 'nao_encontrada' });
    const activeCycle = await ensureActiveTapeCycle(supabase, trap.id);

    const { data: caps } = await supabase
      .from('capturas')
      .select('capturada_em, total_insetos, insetos_novos, nivel, confianca_ia, imagem_url')
      .eq('armadilha_id', trap.id)
      .gte('capturada_em', `${startDate}T00:00:00Z`)
      .lte('capturada_em', `${endDate}T23:59:59Z`)
      .order('capturada_em', { ascending: true });

    return res.json({
      trap: { id: trap.identificador, nome: trap.nome },
      captures: (caps || []).map((item) => ({
        data: item.capturada_em.substring(0, 10),
        hora: item.capturada_em.substring(11, 16),
        insetos: novosInsetos(item),
        insetos_visiveis: item.total_insetos,
        nivel: item.nivel,
        confianca: item.confianca_ia,
        imagem: item.imagem_url,
      })),
    });
  } catch (err) {
    console.error('GET /reports/captures:', err.message);
    return res.status(500).json({
      error: 'erro_servidor',
      message: 'Erro ao listar capturas.',
    });
  }
});

module.exports = router;
