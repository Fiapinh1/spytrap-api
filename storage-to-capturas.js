const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Erro: faltam variáveis no .env. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const BUCKET = 'armadilha-imagens';

function parseArmIdFromName(fileName) {
  const match = fileName.match(/(SPY-\d+)/i);
  return match ? match[1].toUpperCase() : null;
}

function parseCaptureDateFromName(fileName) {
  const match = fileName.match(/(\d{8}-\d{4}-\d{4})/);
  if (!match) return new Date().toISOString();

  const [day, month, year, time] = [
    match[1].slice(0, 2),
    match[1].slice(2, 4),
    match[1].slice(4, 8),
    match[1].slice(9),
  ];
  const hour = time.slice(0, 2);
  const minute = time.slice(2, 4);
  // O nome do arquivo já está no horário local de São Paulo.
  // Portanto não devemos tratá-lo como UTC, senão o frontend mostrará um horário 3 horas atrás.
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:00-03:00`).toISOString();
}

async function main() {
  try {
    const { data: files, error: listError } = await supabase
      .storage
      .from(BUCKET)
      .list('', { limit: 1000 });

    if (listError) {
      throw listError;
    }

    const { data: existingCapturas, error: capturesError } = await supabase
      .from('capturas')
      .select('imagem_url');

    if (capturesError) {
      throw capturesError;
    }

    const existingUrls = new Set((existingCapturas || []).map((item) => item.imagem_url));

    const newFiles = (files || []).filter((file) => !existingUrls.has(file.name));

    if (newFiles.length === 0) {
      console.log('Nenhum arquivo novo encontrado no bucket.');
      return;
    }

    for (const file of newFiles) {
      const identificador = parseArmIdFromName(file.name);
      if (!identificador) {
        console.warn(`Ignorando arquivo sem identificador de armadilha: ${file.name}`);
        continue;
      }

      const { data: traps, error: trapError } = await supabase
        .from('armadilhas')
        .select('id')
        .eq('identificador', identificador)
        .limit(1);

      if (trapError) {
        console.error('Erro ao buscar armadilha para', file.name, trapError);
        continue;
      }

      if (!traps || traps.length === 0) {
        console.warn(`Armadiha não encontrada para identificador ${identificador}. Arquivo: ${file.name}`);
        continue;
      }

      const armadilha_id = traps[0].id;
      const capturada_em = parseCaptureDateFromName(file.name);

      const { data: insertData, error: insertError } = await supabase
        .from('capturas')
        .insert([{
          armadilha_id,
          capturada_em,
          total_insetos: 0,
          nivel: 'unknown',
          confianca_ia: 0,
          imagem_url: file.name,
          bounding_boxes: null,
          criado_em: new Date().toISOString()
        }]);

      if (insertError) {
        console.error('Erro ao inserir captura para', file.name, insertError);
      } else {
        console.log('Captura criada para', file.name, '-> armadilha', identificador);
      }
    }

    console.log('Sincronização concluída.');
  } catch (err) {
    console.error('Erro na sincronização:', err);
  }
}

main();
