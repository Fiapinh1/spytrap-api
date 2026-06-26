const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const {
  calculateNewInsectsForCycle,
  ensureActiveTapeCycle,
  getTapeCycleForTimestamp,
} = require('../services/tapeCycles');

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

const STORAGE_SYNC_SECRET = process.env.STORAGE_SYNC_SECRET || '';

function parseIdentifierFromFileName(fileName) {
  if (!fileName) return null;
  const match = String(fileName).match(/(SPY-\d+)/i);
  return match ? match[1].toUpperCase() : null;
}

function normalizeTimestamp(value) {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

router.post('/storage-event', async (req, res) => {
  try {
    const secretHeader = req.headers['x-storage-sync-secret'];
    if (STORAGE_SYNC_SECRET && secretHeader !== STORAGE_SYNC_SECRET) {
      return res.status(401).json({
        error: 'nao_autorizado',
        message: 'Segredo de webhook inválido.',
      });
    }

    const {
      fileName,
      imagem_url,
      armadilha_id,
      armadilha_identificador,
      capturada_em,
      total_insetos,
      nivel,
      confianca_ia,
      bounding_boxes,
    } = req.body;

    const imageName = fileName || imagem_url;
    if (!imageName) {
      return res.status(422).json({
        error: 'arquivo_obrigatorio',
        message: 'O campo fileName ou imagem_url é obrigatório.',
      });
    }

    const { data: existing, error: existingError } = await supabase
      .from('capturas')
      .select('id')
      .eq('imagem_url', imageName)
      .limit(1)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (existing) {
      return res.status(200).json({
        message: 'Captura já existe para este arquivo.',
        imagem_url: imageName,
      });
    }

    let trapId = armadilha_id;
    if (!trapId) {
      const identificador = armadilha_identificador || parseIdentifierFromFileName(imageName);
      if (!identificador) {
        return res.status(422).json({
          error: 'identificador_obrigatorio',
          message: 'Não foi possível identificar a armadilha. Envie armadilha_id ou armadilha_identificador.',
        });
      }

      const { data: trap, error: trapError } = await supabase
        .from('armadilhas')
        .select('id')
        .eq('identificador', identificador)
        .limit(1)
        .maybeSingle();

      if (trapError) {
        throw trapError;
      }

      if (!trap) {
        return res.status(404).json({
          error: 'armadilha_nao_encontrada',
          message: `Armadilha ${identificador} não encontrada.`,
        });
      }

      trapId = trap.id;
    }

    const capturedAt = normalizeTimestamp(capturada_em);
    const activeCycle = await getTapeCycleForTimestamp(supabase, trapId, capturedAt)
      || await ensureActiveTapeCycle(supabase, trapId, capturedAt);
    const totalInsetos = total_insetos != null ? Number(total_insetos) : 0;
    const insetosNovos = await calculateNewInsectsForCycle(supabase, activeCycle.id, totalInsetos, capturedAt);

    const newRecord = {
      armadilha_id: trapId,
      ciclo_fita_id: activeCycle.id,
      capturada_em: capturedAt,
      total_insetos: totalInsetos,
      insetos_novos: insetosNovos,
      nivel: nivel || 'unknown',
      confianca_ia: confianca_ia != null ? Number(confianca_ia) : 0,
      imagem_url: imageName,
      bounding_boxes: bounding_boxes || null,
      criado_em: new Date().toISOString(),
    };

    const { data: inserted, error: insertError } = await supabase
      .from('capturas')
      .insert([newRecord])
      .select('*')
      .single();

    if (insertError) {
      throw insertError;
    }

    return res.status(201).json({
      message: 'Captura criada com sucesso.',
      captura: inserted || null,
    });
  } catch (err) {
    console.error('POST /api/capturas/storage-event:', err.message || err);
    return res.status(500).json({
      error: 'erro_servidor',
      message: 'Erro ao processar o evento de upload de storage.',
    });
  }
});

module.exports = router;
