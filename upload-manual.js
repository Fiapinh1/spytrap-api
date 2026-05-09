// IntegraçãocomBD/upload-manual.js
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: __dirname + '/.env' });

// Debug: verificar se as variáveis estão carregadas
console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Carregada' : 'Não carregada');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Erro: verifique seu arquivo .env. As variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY devem estar definidas.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function uploadManual({
  fileName,
  armadilha_id,
  capturada_em,
  total_insetos,
  nivel,
  confianca_ia,
  bounding_boxes
}) {
  // Caminho padrão para a pasta capturas-img
  const filePath = path.join(__dirname, 'capturas-img', fileName);

  if (!fs.existsSync(filePath)) {
    console.error('Arquivo não encontrado:', filePath);
    return;
  }

  // 1. Upload para o Storage
  const { data: storageData, error: storageError } = await supabase
    .storage
    .from('armadilha-imagens')
    .upload(fileName, fs.readFileSync(filePath), {
      cacheControl: '3600',
      upsert: false,
      contentType: 'image/jpeg'
    });

  if (storageError) {
    console.error('Erro ao subir imagem:', storageError);
    return;
  }

  // 2. Inserir registro na tabela capturas
  const { data, error } = await supabase
    .from('capturas')
    .insert([{
      armadilha_id,
      capturada_em,
      total_insetos,
      nivel,
      confianca_ia,
      imagem_url: fileName,
      bounding_boxes,
      criado_em: new Date().toISOString()
    }]);

  if (error) {
    console.error('Erro ao inserir no banco:', error);
  } else {
    console.log('Registro inserido com sucesso:', data);
  }
}

// Exemplo de uso:
uploadManual({
  fileName: 'a57353fa-5c6c-4faa-94be-35eea99b8f61.jpeg', // coloque o nome do arquivo que está em captura-img
  armadilha_id: '982c0dbb-c516-42bf-bdea-9dd4b5f9288c',
  capturada_em: new Date().toISOString(),
  total_insetos: 5,
  nivel: 'low',
  confianca_ia: 90,
  bounding_boxes: null // ou um array se quiser
}).catch(console.error);