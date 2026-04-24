<<<<<<< HEAD
const express          = require('express');
const { createClient } = require('@supabase/supabase-js');
const authMiddleware   = require('../middleware/authMiddleware');

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── HELPER: converte decimal → grau°min'seg"N/S/E/W ──────────
function decimalParaDMS(valor, tipo) {
  const absoluto = Math.abs(valor);
  const graus    = Math.floor(absoluto);
  const minutos  = Math.floor((absoluto - graus) * 60);
  const segundos = Math.round(((absoluto - graus) * 60 - minutos) * 60);

  let direcao;
  if (tipo === 'lat') direcao = valor >= 0 ? 'N' : 'S';
  else                direcao = valor >= 0 ? 'E' : 'W';

  return `${graus}°${String(minutos).padStart(2, '0')}'${String(segundos).padStart(2, '0')}"${direcao}`;
}

// ── HELPER: formata armadilha do banco → formato do frontend ──
function formatarArmadilha(row) {
  return {
    id:          row.identificador,
    dbId:        row.id,
    name:        row.nome,
    lat:         decimalParaDMS(row.latitude,  'lat'),
    lng:         decimalParaDMS(row.longitude, 'lng'),
    latDec:      parseFloat(row.latitude),
    lngDec:      parseFloat(row.longitude),
    status:      row.status,
    cultura:     row.cultura     || null,
    fazenda:     row.fazenda     || null,
    responsavel: row.responsavel || null,
    criadoEm:    row.criado_em,
  };
}

// ════════════════════════════════════════════════════════════
//  GET /api/traps
//  Lista todas as armadilhas ativas do sistema.
//  Requer autenticação (qualquer perfil).
// ════════════════════════════════════════════════════════════
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('armadilhas')
      .select('*')
      .eq('ativo', true)
      .order('identificador', { ascending: true });

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.json([]);
    }

    return res.json(data.map(formatarArmadilha));

  } catch (err) {
    console.error('GET /traps:', err.message);
    return res.status(500).json({
      error:   'erro_servidor',
      message: 'Erro ao buscar armadilhas.',
    });
  }
});

// ════════════════════════════════════════════════════════════
//  GET /api/traps/:id
//  Retorna dados de uma armadilha específica pelo identificador.
//  Requer autenticação.
//
//  OBS: monthTotal, peakDay, monthCaptures retornam 0 por ora.
//  Serão calculados quando o sistema de capturas for integrado.
// ════════════════════════════════════════════════════════════
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('armadilhas')
      .select('*')
      .eq('identificador', id)
      .eq('ativo', true)
      .single();

    if (error || !data) {
      return res.status(404).json({
        error:   'nao_encontrada',
        message: `Armadilha "${id}" não encontrada.`,
      });
    }

    const trap = formatarArmadilha(data);

    return res.json({
      ...trap,
      lastCapture:   'Sem dados',    // TODO: buscar da tabela de capturas
      monthTotal:    0,              // TODO: calcular da tabela de capturas
      peakDay:       0,              // TODO: calcular da tabela de capturas
      monthCaptures: 0,              // TODO: calcular da tabela de capturas
    });

  } catch (err) {
    console.error(`GET /traps/${req.params.id}:`, err.message);
    return res.status(500).json({
      error:   'erro_servidor',
      message: 'Erro ao buscar dados da armadilha.',
    });
  }
});

// ════════════════════════════════════════════════════════════
//  PATCH /api/traps/:id/status
//  Altera o status (online/offline) de uma armadilha.
//  Requer perfil admin.
// ════════════════════════════════════════════════════════════
router.patch('/:id/status', authMiddleware, async (req, res) => {
  if (req.user.perfil !== 'admin') {
    return res.status(403).json({
      error:   'sem_permissao',
      message: 'Apenas administradores podem alterar o status.',
    });
  }

  const { status } = req.body;
  if (!['online', 'offline'].includes(status)) {
    return res.status(422).json({
      error:   'status_invalido',
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
        error:   'nao_encontrada',
        message: `Armadilha "${req.params.id}" não encontrada.`,
      });
    }

    return res.json({ success: true, armadilha: data });

  } catch (err) {
    console.error(`PATCH /traps/${req.params.id}/status:`, err.message);
    return res.status(500).json({
      error:   'erro_servidor',
      message: 'Erro ao atualizar status.',
    });
  }
});

// ════════════════════════════════════════════════════════════
//  DELETE /api/traps/:id
//  Desativa uma armadilha (soft delete — mantém no banco).
//  Requer perfil admin.
// ════════════════════════════════════════════════════════════
router.delete('/:id', authMiddleware, async (req, res) => {
  if (req.user.perfil !== 'admin') {
    return res.status(403).json({
      error:   'sem_permissao',
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
        error:   'nao_encontrada',
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
      error:   'erro_servidor',
      message: 'Erro ao desativar armadilha.',
    });
  }
});

=======
const express          = require('express');
const { createClient } = require('@supabase/supabase-js');
const authMiddleware   = require('../middleware/authMiddleware');

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── HELPER: converte decimal → grau°min'seg"N/S/E/W ──────────
function decimalParaDMS(valor, tipo) {
  const absoluto = Math.abs(valor);
  const graus    = Math.floor(absoluto);
  const minutos  = Math.floor((absoluto - graus) * 60);
  const segundos = Math.round(((absoluto - graus) * 60 - minutos) * 60);

  let direcao;
  if (tipo === 'lat') direcao = valor >= 0 ? 'N' : 'S';
  else                direcao = valor >= 0 ? 'E' : 'W';

  return `${graus}°${String(minutos).padStart(2, '0')}'${String(segundos).padStart(2, '0')}"${direcao}`;
}

// ── HELPER: formata armadilha do banco → formato do frontend ──
function formatarArmadilha(row) {
  return {
    id:          row.identificador,
    dbId:        row.id,
    name:        row.nome,
    lat:         decimalParaDMS(row.latitude,  'lat'),
    lng:         decimalParaDMS(row.longitude, 'lng'),
    latDec:      parseFloat(row.latitude),
    lngDec:      parseFloat(row.longitude),
    status:      row.status,
    cultura:     row.cultura     || null,
    fazenda:     row.fazenda     || null,
    responsavel: row.responsavel || null,
    criadoEm:    row.criado_em,
  };
}

// ════════════════════════════════════════════════════════════
//  GET /api/traps
//  Lista todas as armadilhas ativas do sistema.
//  Requer autenticação (qualquer perfil).
// ════════════════════════════════════════════════════════════
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('armadilhas')
      .select('*')
      .eq('ativo', true)
      .order('identificador', { ascending: true });

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.json([]);
    }

    return res.json(data.map(formatarArmadilha));

  } catch (err) {
    console.error('GET /traps:', err.message);
    return res.status(500).json({
      error:   'erro_servidor',
      message: 'Erro ao buscar armadilhas.',
    });
  }
});

// ════════════════════════════════════════════════════════════
//  GET /api/traps/:id
//  Retorna dados de uma armadilha específica pelo identificador.
//  Requer autenticação.
//
//  OBS: monthTotal, peakDay, monthCaptures retornam 0 por ora.
//  Serão calculados quando o sistema de capturas for integrado.
// ════════════════════════════════════════════════════════════
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('armadilhas')
      .select('*')
      .eq('identificador', id)
      .eq('ativo', true)
      .single();

    if (error || !data) {
      return res.status(404).json({
        error:   'nao_encontrada',
        message: `Armadilha "${id}" não encontrada.`,
      });
    }

    const trap = formatarArmadilha(data);

    return res.json({
      ...trap,
      lastCapture:   'Sem dados',    // TODO: buscar da tabela de capturas
      monthTotal:    0,              // TODO: calcular da tabela de capturas
      peakDay:       0,              // TODO: calcular da tabela de capturas
      monthCaptures: 0,              // TODO: calcular da tabela de capturas
    });

  } catch (err) {
    console.error(`GET /traps/${req.params.id}:`, err.message);
    return res.status(500).json({
      error:   'erro_servidor',
      message: 'Erro ao buscar dados da armadilha.',
    });
  }
});

// ════════════════════════════════════════════════════════════
//  PATCH /api/traps/:id/status
//  Altera o status (online/offline) de uma armadilha.
//  Requer perfil admin.
// ════════════════════════════════════════════════════════════
router.patch('/:id/status', authMiddleware, async (req, res) => {
  if (req.user.perfil !== 'admin') {
    return res.status(403).json({
      error:   'sem_permissao',
      message: 'Apenas administradores podem alterar o status.',
    });
  }

  const { status } = req.body;
  if (!['online', 'offline'].includes(status)) {
    return res.status(422).json({
      error:   'status_invalido',
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
        error:   'nao_encontrada',
        message: `Armadilha "${req.params.id}" não encontrada.`,
      });
    }

    return res.json({ success: true, armadilha: data });

  } catch (err) {
    console.error(`PATCH /traps/${req.params.id}/status:`, err.message);
    return res.status(500).json({
      error:   'erro_servidor',
      message: 'Erro ao atualizar status.',
    });
  }
});

// ════════════════════════════════════════════════════════════
//  DELETE /api/traps/:id
//  Desativa uma armadilha (soft delete — mantém no banco).
//  Requer perfil admin.
// ════════════════════════════════════════════════════════════
router.delete('/:id', authMiddleware, async (req, res) => {
  if (req.user.perfil !== 'admin') {
    return res.status(403).json({
      error:   'sem_permissao',
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
        error:   'nao_encontrada',
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
      error:   'erro_servidor',
      message: 'Erro ao desativar armadilha.',
    });
  }
});

>>>>>>> b094c2f (Atualiza front-end para integração com imagens do Supabase)
module.exports = router;