const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const authMiddleware = require('../middleware/authMiddleware');
const {
  ensureActiveTapeCycle,
  registerTapeChange,
} = require('../services/tapeCycles');

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
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

function formatarUltimaCaptura(row) {
  if (!row?.capturada_em) return 'Sem dados';

  const data = new Date(row.capturada_em);
  if (Number.isNaN(data.getTime())) return 'Sem dados';

  const hojeLocal = dateKeyNoFuso(new Date());
  const dataLocal = dateKeyDaCaptura(row.capturada_em);
  const diffDias = diferencaDiasEntreChaves(hojeLocal, dataLocal);
  const hora = formatarCaptura(row).time;

  if (diffDias === 0) return `Hoje às ${hora}`;
  if (diffDias === 1) return `Ontem às ${hora}`;

  const dataFmt = dataFormatadaDaCaptura(row.capturada_em, data);

  return `${dataFmt} às ${hora}`;
}

function dateKeyDaCaptura(timestamp) {
  if (typeof timestamp === 'string' && /^\d{4}-\d{2}-\d{2}/.test(timestamp)) {
    return timestamp.slice(0, 10);
  }
  return dateKeyNoFuso(new Date(timestamp));
}

function horaDaCaptura(timestamp, data = new Date(timestamp)) {
  if (typeof timestamp === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(timestamp)) {
    return timestamp.slice(11, 16);
  }

  return data.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: APP_TIME_ZONE,
  });
}

function dataFormatadaDaCaptura(timestamp, data = new Date(timestamp)) {
  if (typeof timestamp === 'string' && /^\d{4}-\d{2}-\d{2}/.test(timestamp)) {
    const [ano, mes, dia] = timestamp.slice(0, 10).split('-');
    return `${dia}/${mes}/${ano}`;
  }

  return data.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: APP_TIME_ZONE,
  });
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

function erroTrocaFita(error) {
  const mensagem = error?.message || '';
  if (mensagem.includes('conflito_ciclo_posterior')) {
    return {
      status: 409,
      error: 'conflito_ciclo_posterior',
      message: 'Existe uma troca de fita posterior a essa data. Nenhuma alteração foi feita.',
    };
  }
  if (mensagem.includes('ja_existe_ciclo_neste_horario')) {
    return {
      status: 409,
      error: 'ciclo_duplicado',
      message: 'Já existe uma troca de fita registrada exatamente nesse horário.',
    };
  }
  if (mensagem.includes('ciclo_anterior_nao_encontrado')) {
    return {
      status: 422,
      error: 'ciclo_anterior_nao_encontrado',
      message: 'Não foi encontrado um ciclo anterior para essa data de troca.',
    };
  }
  if (mensagem.includes('data_troca_obrigatoria')) {
    return {
      status: 422,
      error: 'data_troca_obrigatoria',
      message: 'Informe data e hora válidas para a troca de fita.',
    };
  }
  return null;
}

function formatarCaptura(row) {
  const data = new Date(row.capturada_em);
  const rawCount = Number(row.total_insetos) || 0;
  const storedNewCount = row.insetos_novos ?? row.total_insetos_novos;
  const newCount = storedNewCount === undefined
    ? rawCount
    : Number(storedNewCount) || 0;

  return {
    id: row.id,
    cycleId: row.ciclo_fita_id || null,
    date: dateKeyNoFuso(data),
    time: horaDaCaptura(row.capturada_em, data),
    count: newCount,
    rawCount,
    level: row.nivel,
    confidence: row.confianca_ia === null || row.confianca_ia === undefined
      ? null
      : Math.round(Number(row.confianca_ia)),
    imageUrl: normalizarImagemUrl(row.imagem_url),
    boundingBoxes: Array.isArray(row.bounding_boxes) ? row.bounding_boxes : [],
  };
}

function aplicarContagemIncremental(capturas, maiorTotalInicial = 0) {
  let maiorTotalConhecido = Number(maiorTotalInicial) || 0;

  return (capturas || []).map((captura) => {
    if (captura.insetos_novos !== undefined && captura.insetos_novos !== null) {
      return {
        ...captura,
        total_insetos_novos: Number(captura.insetos_novos) || 0,
      };
    }

    const totalAtual = Number(captura.total_insetos) || 0;
    const totalNovos = Math.max(totalAtual - maiorTotalConhecido, 0);

    maiorTotalConhecido = Math.max(maiorTotalConhecido, totalAtual);

    return {
      ...captura,
      total_insetos_novos: totalNovos,
    };
  });
}

function somarNovosInsetosPorDia(capturas, maiorTotalInicial = 0) {
  const porDia = {};

  for (const captura of aplicarContagemIncremental(capturas, maiorTotalInicial)) {
    const dia = dateKeyNoFuso(new Date(captura.capturada_em));
    porDia[dia] = (porDia[dia] || 0) + (Number(captura.total_insetos_novos) || 0);
  }

  return porDia;
}

function classificarInfestacaoPorSoma(soma) {
  if (soma <= 3) {
    return { level: 'low', label: 'Baixa' };
  }

  if (soma <= 6) {
    return { level: 'med', label: 'Média' };
  }

  return { level: 'high', label: 'Alta' };
}

function calcularInfestacaoUltimosTresDias(capturas) {
  const porDia = somarNovosInsetosPorDia(capturas || []);
  const dias = Object.keys(porDia).sort().slice(-3);
  const sum = dias.reduce((total, dia) => total + (porDia[dia] || 0), 0);
  const classification = classificarInfestacaoPorSoma(sum);

  return {
    ...classification,
    sum,
    daysAvailable: dias.length,
    daysRequired: 3,
    insufficientData: dias.length < 3,
    days: dias.map((date) => ({
      date,
      count: porDia[date] || 0,
    })),
  };
}

function formatarCicloFita(ciclo, capturas = []) {
  if (!ciclo) return null;

  const porDia = somarNovosInsetosPorDia(capturas);
  const dias = Object.keys(porDia).sort();
  let maiorSomaTresDias = 0;

  for (let i = 0; i < dias.length; i++) {
    const janela = dias.slice(Math.max(0, i - 2), i + 1);
    const soma = janela.reduce((total, dia) => total + (porDia[dia] || 0), 0);
    if (soma > maiorSomaTresDias) maiorSomaTresDias = soma;
  }

  const inicio = new Date(ciclo.iniciado_em);
  const fim = ciclo.encerrado_em ? new Date(ciclo.encerrado_em) : new Date();
  const diasEmUso = Math.max(1, Math.ceil((fim - inicio) / 86400000));
  const total = Object.values(porDia).reduce((sum, value) => sum + value, 0);
  const maxClassification = classificarInfestacaoPorSoma(maiorSomaTresDias);

  return {
    id: ciclo.id,
    status: ciclo.status,
    startedAt: ciclo.iniciado_em,
    endedAt: ciclo.encerrado_em,
    note: ciclo.observacao || null,
    daysInUse: diasEmUso,
    total,
    maxThreeDaySum: maiorSomaTresDias,
    maxClassification,
  };
}

function cicloVazioSemUso(ciclo, capturas = []) {
  if (!ciclo?.encerrado_em || ciclo.status !== 'encerrado') return false;
  const inicio = new Date(ciclo.iniciado_em).getTime();
  const fim = new Date(ciclo.encerrado_em).getTime();
  return inicio === fim && (!capturas || capturas.length === 0);
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
    const activeCycle = await ensureActiveTapeCycle(supabase, row.id, new Date().toISOString());
    const agora = new Date();
    const inicioMes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
    const inicioProxMes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 1));

    const [
      { data: ultimaCaptura, error: erroUltima },
      { data: capturasMes, error: erroMes },
      { data: capturasInfestacao, error: erroInfestacao },
      { data: ciclos, error: erroCiclos },
      { data: capturasCiclos, error: erroCapturasCiclos },
    ] = await Promise.all([
      supabase
        .from('capturas')
        .select('id, ciclo_fita_id, capturada_em, total_insetos, insetos_novos, nivel, confianca_ia, imagem_url, bounding_boxes')
        .eq('armadilha_id', row.id)
        .order('capturada_em', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('capturas')
        .select('capturada_em, total_insetos, insetos_novos')
        .eq('armadilha_id', row.id)
        .eq('ciclo_fita_id', activeCycle.id)
        .gte('capturada_em', inicioMes.toISOString())
        .lt('capturada_em', inicioProxMes.toISOString()),
      supabase
        .from('capturas')
        .select('capturada_em, total_insetos, insetos_novos')
        .eq('armadilha_id', row.id)
        .eq('ciclo_fita_id', activeCycle.id)
        .order('capturada_em', { ascending: true }),
      supabase
        .from('ciclos_fita')
        .select('*')
        .eq('armadilha_id', row.id)
        .order('iniciado_em', { ascending: false }),
      supabase
        .from('capturas')
        .select('ciclo_fita_id, capturada_em, total_insetos, insetos_novos')
        .eq('armadilha_id', row.id)
        .order('capturada_em', { ascending: true }),
    ]);

    if (erroUltima) throw erroUltima;
    if (erroMes) throw erroMes;
    if (erroInfestacao) throw erroInfestacao;
    if (erroCiclos) throw erroCiclos;
    if (erroCapturasCiclos) throw erroCapturasCiclos;

    const somaPorDia = somarNovosInsetosPorDia(capturasMes || []);
    const infestation = calcularInfestacaoUltimosTresDias(capturasInfestacao || []);
    const capturasPorCiclo = (capturasCiclos || []).reduce((acc, captura) => {
      if (!captura.ciclo_fita_id) return acc;
      acc[captura.ciclo_fita_id] ||= [];
      acc[captura.ciclo_fita_id].push(captura);
      return acc;
    }, {});
    const tapeCycles = (ciclos || [])
      .filter((ciclo) => !cicloVazioSemUso(ciclo, capturasPorCiclo[ciclo.id] || []))
      .map((ciclo) => formatarCicloFita(ciclo, capturasPorCiclo[ciclo.id] || []));

    return res.json({
      ...trap,
      lastCapture: formatarUltimaCaptura(ultimaCaptura),
      latestCapture: ultimaCaptura ? formatarCaptura(ultimaCaptura) : null,
      monthTotal: Object.values(somaPorDia).reduce((total, valor) => total + valor, 0),
      peakDay: Object.keys(somaPorDia).length ? Math.max(...Object.values(somaPorDia)) : 0,
      monthCaptures: (capturasMes || []).length,
      infestation,
      activeTapeCycle: formatarCicloFita(activeCycle, capturasPorCiclo[activeCycle.id] || []),
      tapeCycleHistory: tapeCycles.filter((cycle) => cycle.id !== activeCycle.id),
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
    const activeCycle = await ensureActiveTapeCycle(supabase, trap.id, new Date().toISOString());

    if (date) {
      const { inicioIso, fimIso } = faixaUtcDoDiaLocal(date);
      const { data, error } = await supabase
        .from('capturas')
        .select('id, ciclo_fita_id, capturada_em, total_insetos, insetos_novos, nivel, confianca_ia, imagem_url, bounding_boxes')
        .eq('armadilha_id', trap.id)
        .gte('capturada_em', inicioIso)
        .lte('capturada_em', fimIso)
        .order('capturada_em', { ascending: true });

      if (error) throw error;
      return res.json(aplicarContagemIncremental(data || []).map(formatarCaptura));
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
      .select('id, ciclo_fita_id, capturada_em, total_insetos, insetos_novos, nivel, confianca_ia, imagem_url, bounding_boxes')
      .eq('armadilha_id', trap.id)
      .gte('capturada_em', inicioFaixa)
      .lte('capturada_em', fimFaixa)
      .order('capturada_em', { ascending: true });

    if (error) throw error;

    const agrupado = {};
    for (const captura of aplicarContagemIncremental(data || [])) {
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
    const activeCycle = await ensureActiveTapeCycle(supabase, trap.id, new Date().toISOString());

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

    // Fetch both captures AND tape cycles
    const [
      { data: captures, error: capErr },
      { data: cycles, error: cycleErr }
    ] = await Promise.all([
      supabase
        .from('capturas')
        .select('capturada_em, total_insetos, insetos_novos, nivel')
        .eq('armadilha_id', trap.id)
        .gte('capturada_em', inicio.toISOString())
        .lt('capturada_em', fim.toISOString())
        .order('capturada_em', { ascending: true }),
      supabase
        .from('ciclos_fita')
        .select('id, iniciado_em, encerrado_em, status, observacao')
        .eq('armadilha_id', trap.id)
        .gte('iniciado_em', inicio.toISOString())
        .lt('iniciado_em', fim.toISOString())
        .order('iniciado_em', { ascending: true })
    ]);

    if (capErr) throw capErr;
    if (cycleErr) throw cycleErr;

    const porDia = {};
    for (const captura of aplicarContagemIncremental(captures || [])) {
      const dia = dateKeyNoFuso(new Date(captura.capturada_em));
      if (!porDia[dia]) porDia[dia] = { date: dia, count: 0, maxLevel: 'low', isTapeChange: false, tapeChanges: [] };
      porDia[dia].count += Number(captura.total_insetos_novos) || 0;
      if (captura.nivel === 'high') porDia[dia].maxLevel = 'high';
      else if (captura.nivel === 'med' && porDia[dia].maxLevel !== 'high') porDia[dia].maxLevel = 'med';
    }

    // Mark tape change days
    for (const cycle of cycles || []) {
      if (cicloVazioSemUso(cycle, [])) continue;
      const dia = dateKeyNoFuso(new Date(cycle.iniciado_em));
      const item = {
        id: cycle.id,
        at: cycle.iniciado_em,
        time: horaDaCaptura(cycle.iniciado_em),
        note: cycle.observacao || null,
      };
      if (!porDia[dia]) {
        porDia[dia] = { date: dia, count: 0, maxLevel: 'low', isTapeChange: true, tapeChanges: [item] };
      } else {
        porDia[dia].isTapeChange = true;
        porDia[dia].tapeChanges ||= [];
        porDia[dia].tapeChanges.push(item);
      }
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

router.post('/:id/tape-cycle/replace', authMiddleware, async (req, res) => {
  try {
    const trap = await buscarArmadilhaAtivaPorIdentificador(req.params.id);
    if (!trap) {
      return res.status(404).json({
        error: 'nao_encontrada',
        message: `Armadilha "${req.params.id}" nÃ£o encontrada.`,
      });
    }

    const requestedAt = req.body?.effectiveAt || new Date().toISOString();
    const changedAtDate = new Date(requestedAt);
    if (Number.isNaN(changedAtDate.getTime())) {
      return res.status(422).json({
        error: 'data_troca_invalida',
        message: 'Informe uma data/hora de troca válida.',
      });
    }

    const result = await registerTapeChange(
      supabase,
      trap.id,
      changedAtDate.toISOString(),
      req.body?.note || null
    );

    return res.status(201).json({
      success: true,
      message: 'Nova fita iniciada com sucesso.',
      previous: result.previous ? formatarCicloFita(result.previous, []) : null,
      current: formatarCicloFita(result.current, []),
      movedCaptures: result.movedCaptures,
    });
  } catch (err) {
    const handled = erroTrocaFita(err);
    if (handled) {
      return res.status(handled.status).json({
        error: handled.error,
        message: handled.message,
      });
    }

    console.error(`POST /traps/${req.params.id}/tape-cycle/replace:`, err.message);
    return res.status(500).json({
      error: 'erro_servidor',
      message: 'Erro ao trocar a fita da armadilha.',
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
