const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
const IMAGE_BUCKET = process.env.SUPABASE_IMAGE_BUCKET || 'armadilha-imagens';
const APP_TIME_ZONE = 'America/Sao_Paulo';

function decimalParaDMS(valor, tipo) {
  const absoluto = Math.abs(valor);
  const graus = Math.floor(absoluto);
  const minutos = Math.floor((absoluto - graus) * 60);
  const segundos = Math.round((((absoluto - graus) * 60) - minutos) * 60);

  let direcao;
  if (tipo === 'lat') direcao = valor >= 0 ? 'N' : 'S';
  else direcao = valor >= 0 ? 'E' : 'W';

  return `${graus}°${String(minutos).padStart(2, '0')}'${String(segundos).padStart(2, '0')}"${direcao}`;
}

function formatarArmadilha(row) {
  return {
    id: row.identificador,
    dbId: row.id,
    name: row.nome,
    lat: decimalParaDMS(row.latitude, 'lat'),
    lng: decimalParaDMS(row.longitude, 'lng'),
    latDec: parseFloat(row.latitude),
    lngDec: parseFloat(row.longitude),
    status: row.status,
    cultura: row.cultura || null,
    fazenda: row.fazenda || null,
    responsavel: row.responsavel || null,
    criadoEm: row.criado_em,
  };
}

function normalizarImagemUrl(valor) {
  if (!valor) return null;
  if (/^https?:\/\//i.test(valor)) return valor;

  let caminho = String(valor).trim().replace(/^\/+/, '');
  const prefixoBucket = `${IMAGE_BUCKET}/`;

  if (caminho.startsWith(prefixoBucket)) {
    caminho = caminho.slice(prefixoBucket.length);
  }

  const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(caminho);
  return data?.publicUrl || null;
}

function formatarUltimaCaptura(timestamp) {
  if (!timestamp) return 'Sem dados';

  const data = new Date(timestamp);
  if (Number.isNaN(data.getTime())) return 'Sem dados';

  const hojeLocal = dateKeyNoFuso(new Date());
  const dataLocal = dateKeyNoFuso(data);
  const diffDias = diferencaDiasEntreChaves(hojeLocal, dataLocal);
  const hora = data.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: APP_TIME_ZONE,
  });

  if (diffDias === 0) return `Hoje às ${hora}`;
  if (diffDias === 1) return `Ontem às ${hora}`;

  const dataFmt = data.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: APP_TIME_ZONE,
  });

  return `${dataFmt} às ${hora}`;
}

function dateKeyNoFuso(data) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(data);

  const year = partes.find((p) => p.type === 'year')?.value;
  const month = partes.find((p) => p.type === 'month')?.value;
  const day = partes.find((p) => p.type === 'day')?.value;

  return `${year}-${month}-${day}`;
}

function diferencaDiasEntreChaves(chaveA, chaveB) {
  const a = new Date(`${chaveA}T12:00:00Z`);
  const b = new Date(`${chaveB}T12:00:00Z`);
  return Math.round((a - b) / 86400000);
}

function faixaUtcDoDiaLocal(dateKey) {
  const inicio = new Date(`${dateKey}T00:00:00-03:00`);
  const fim = new Date(`${dateKey}T23:59:59.999-03:00`);
  return {
    inicioIso: inicio.toISOString(),
    fimIso: fim.toISOString(),
  };
}

function formatarCaptura(row) {
  const data = new Date(row.capturada_em);
  return {
    id: row.id,
    time: data.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    }),
    count: row.total_insetos,
    level: row.nivel,
    confidence: row.confianca_ia === null || row.confianca_ia === undefined
      ? null
      : Math.round(Number(row.confianca_ia)),
    imageUrl: normalizarImagemUrl(row.imagem_url),
    boundingBoxes: Array.isArray(row.bounding_boxes) ? row.bounding_boxes : [],
  };
}

async function buscarArmadilhaAtivaPorIdentificador(identificador) {
  const { data, error } = await supabase
    .from('armadilhas')
    .select('*')
    .eq('identificador', identificador)
    .eq('ativo', true)
    .single();

  if (error || !data) return null;
  return data;
}

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('armadilhas')
      .select('*')
      .eq('ativo', true)
      .order('identificador', { ascending: true });

    if (error) throw error;
    return res.json((data || []).map(formatarArmadilha));
  } catch (err) {
    console.error('GET /traps:', err.message);
    return res.status(500).json({
      error: 'erro_servidor',
      message: 'Erro ao buscar armadilhas.',
    });
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const row = await buscarArmadilhaAtivaPorIdentificador(req.params.id);
    if (!row) {
      return res.status(404).json({
        error: 'nao_encontrada',
        message: `Armadilha "${req.params.id}" não encontrada.`,
      });
    }

    const trap = formatarArmadilha(row);
    const agora = new Date();
    const inicioMes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
    const inicioProxMes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 1));

    const [
      { data: ultimaCaptura, error: erroUltima },
      { data: capturasMes, error: erroMes },
    ] = await Promise.all([
      supabase
        .from('capturas')
        .select('capturada_em')
        .eq('armadilha_id', row.id)
        .order('capturada_em', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('capturas')
        .select('capturada_em, total_insetos')
        .eq('armadilha_id', row.id)
        .gte('capturada_em', inicioMes.toISOString())
        .lt('capturada_em', inicioProxMes.toISOString()),
    ]);

    if (erroUltima) throw erroUltima;
    if (erroMes) throw erroMes;

    const somaPorDia = {};
    for (const captura of capturasMes || []) {
      const dia = dateKeyNoFuso(new Date(captura.capturada_em));
      somaPorDia[dia] = (somaPorDia[dia] || 0) + (captura.total_insetos || 0);
    }

    return res.json({
      ...trap,
      lastCapture: formatarUltimaCaptura(ultimaCaptura?.capturada_em),
      monthTotal: (capturasMes || []).reduce((total, captura) => total + (captura.total_insetos || 0), 0),
      peakDay: Object.keys(somaPorDia).length ? Math.max(...Object.values(somaPorDia)) : 0,
      monthCaptures: (capturasMes || []).length,
    });
  } catch (err) {
    console.error(`GET /traps/${req.params.id}:`, err.message);
    return res.status(500).json({
      error: 'erro_servidor',
      message: 'Erro ao buscar dados da armadilha.',
    });
  }
});

router.get('/:id/captures', authMiddleware, async (req, res) => {
  try {
    const trap = await buscarArmadilhaAtivaPorIdentificador(req.params.id);
    if (!trap) {
      return res.status(404).json({
        error: 'nao_encontrada',
        message: `Armadilha "${req.params.id}" não encontrada.`,
      });
    }

    const { date, startDate, endDate } = req.query;

    if (date) {
      const { inicioIso, fimIso } = faixaUtcDoDiaLocal(date);
      const { data, error } = await supabase
        .from('capturas')
        .select('id, capturada_em, total_insetos, nivel, confianca_ia, imagem_url, bounding_boxes')
        .eq('armadilha_id', trap.id)
        .gte('capturada_em', inicioIso)
        .lte('capturada_em', fimIso)
        .order('capturada_em', { ascending: true });

      if (error) throw error;
      return res.json((data || []).map(formatarCaptura));
    }

    if (!startDate || !endDate) {
      return res.status(422).json({
        error: 'parametros_obrigatorios',
        message: 'Informe "date" ou "startDate" e "endDate".',
      });
    }

    const inicioFaixa = faixaUtcDoDiaLocal(startDate).inicioIso;
    const fimFaixa = faixaUtcDoDiaLocal(endDate).fimIso;
    const { data, error } = await supabase
      .from('capturas')
      .select('id, capturada_em, total_insetos, nivel, confianca_ia, imagem_url, bounding_boxes')
      .eq('armadilha_id', trap.id)
      .gte('capturada_em', inicioFaixa)
      .lte('capturada_em', fimFaixa)
      .order('capturada_em', { ascending: true });

    if (error) throw error;

    const agrupado = {};
    for (const captura of data || []) {
      const dia = dateKeyNoFuso(new Date(captura.capturada_em));
      agrupado[dia] ||= [];
      agrupado[dia].push(formatarCaptura(captura));
    }

    return res.json(
      Object.keys(agrupado)
        .sort()
        .map((dia) => ({
          date: dia,
          captures: agrupado[dia],
        }))
    );
  } catch (err) {
    console.error(`GET /traps/${req.params.id}/captures:`, err.message);
    return res.status(500).json({
      error: 'erro_servidor',
      message: 'Erro ao buscar capturas.',
    });
  }
});

router.get('/:id/calendar', authMiddleware, async (req, res) => {
  try {
    const trap = await buscarArmadilhaAtivaPorIdentificador(req.params.id);
    if (!trap) {
      return res.status(404).json({
        error: 'nao_encontrada',
        message: `Armadilha "${req.params.id}" não encontrada.`,
      });
    }

    const year = Number(req.query.year);
    const month = Number(req.query.month);

    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return res.status(422).json({
        error: 'parametros_invalidos',
        message: 'Informe year e month válidos.',
      });
    }

    const inicio = new Date(Date.UTC(year, month - 1, 1));
    const fim = new Date(Date.UTC(year, month, 1));

    const { data, error } = await supabase
      .from('capturas')
      .select('capturada_em, nivel')
      .eq('armadilha_id', trap.id)
      .gte('capturada_em', inicio.toISOString())
      .lt('capturada_em', fim.toISOString())
      .order('capturada_em', { ascending: true });

    if (error) throw error;

    const porDia = {};
    for (const captura of data || []) {
      const dia = dateKeyNoFuso(new Date(captura.capturada_em));
      if (!porDia[dia]) porDia[dia] = { date: dia, count: 0, maxLevel: 'low' };
      porDia[dia].count += 1;
      if (captura.nivel === 'high') porDia[dia].maxLevel = 'high';
      else if (captura.nivel === 'med' && porDia[dia].maxLevel !== 'high') porDia[dia].maxLevel = 'med';
    }

    return res.json(Object.values(porDia).sort((a, b) => a.date.localeCompare(b.date)));
  } catch (err) {
    console.error(`GET /traps/${req.params.id}/calendar:`, err.message);
    return res.status(500).json({
      error: 'erro_servidor',
      message: 'Erro ao buscar calendário da armadilha.',
    });
  }
});

router.patch('/:id/status', authMiddleware, async (req, res) => {
  if (req.user.perfil !== 'admin') {
    return res.status(403).json({
      error: 'sem_permissao',
      message: 'Apenas administradores podem alterar o status.',
    });
  }

  const { status } = req.body;
  if (!['online', 'offline'].includes(status)) {
    return res.status(422).json({
      error: 'status_invalido',
      message: 'Status deve ser "online" ou "offline".',
    });
  }

  try {
    const { data, error } = await supabase
      .from('armadilhas')
      .update({ status })
      .eq('identificador', req.params.id)
      .select('identificador, nome, status')
      .single();

    if (error || !data) {
      return res.status(404).json({
        error: 'nao_encontrada',
        message: `Armadilha "${req.params.id}" não encontrada.`,
      });
    }

    return res.json({ success: true, armadilha: data });
  } catch (err) {
    console.error(`PATCH /traps/${req.params.id}/status:`, err.message);
    return res.status(500).json({
      error: 'erro_servidor',
      message: 'Erro ao atualizar status.',
    });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  if (req.user.perfil !== 'admin') {
    return res.status(403).json({
      error: 'sem_permissao',
      message: 'Apenas administradores podem remover armadilhas.',
    });
  }

  try {
    const { data, error } = await supabase
      .from('armadilhas')
      .update({ ativo: false })
      .eq('identificador', req.params.id)
      .select('identificador, nome')
      .single();

    if (error || !data) {
      return res.status(404).json({
        error: 'nao_encontrada',
        message: `Armadilha "${req.params.id}" não encontrada.`,
      });
    }

    return res.json({
      success: true,
      message: `Armadilha "${data.nome}" desativada com sucesso.`,
    });
  } catch (err) {
    console.error(`DELETE /traps/${req.params.id}:`, err.message);
    return res.status(500).json({
      error: 'erro_servidor',
      message: 'Erro ao desativar armadilha.',
    });
  }
});

module.exports = router;
