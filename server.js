require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');

const requiredEnv = [
  'SUPABASE_URL',
  'JWT_SECRET',
];

const hasSupabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const missingEnv = requiredEnv.filter((key) => !process.env[key]);

if (!hasSupabaseKey) {
  missingEnv.push('SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_SERVICE_KEY');
}

if (missingEnv.length > 0) {
  console.error(
    `Configuracao incompleta. Variaveis ausentes: ${missingEnv.join(', ')}`
  );
  process.exit(1);
}

const authRoutes = require('./routes/auth');
const trapsRoutes = require('./routes/traps');
const heatmapRoutes = require('./routes/heatmap');
const reportsRoutes = require('./routes/reports');
const capturasRoutes = require('./routes/capturas');

const app = express();
const PORT = process.env.PORT || 3000;

// Raiz do projeto
const rootDir = process.cwd();

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));

app.use(express.json());

// =====================================================
// ARQUIVOS ESTÁTICOS DO FRONTEND
// Precisa vir antes das rotas /api e antes do 404
// =====================================================

app.use(express.static(rootDir, { index: false }));

app.use('/Logos', express.static(path.join(rootDir, 'Logos')));
app.use('/capturas-img', express.static(path.join(rootDir, 'capturas-img')));

// Arquivos principais do frontend
app.get('/', (req, res) => {
  res.redirect('/login.html');
});

app.get('/login.html', (req, res) => {
  res.sendFile(path.join(rootDir, 'login.html'));
});

app.get('/index.html', (req, res) => {
  res.sendFile(path.join(rootDir, 'index.html'));
});

app.get('/styles.css', (req, res) => {
  res.sendFile(path.join(rootDir, 'styles.css'));
});

app.get('/capturas.js', (req, res) => {
  res.sendFile(path.join(rootDir, 'capturas.js'));
});

app.get('/heatmap.js', (req, res) => {
  res.sendFile(path.join(rootDir, 'heatmap.js'));
});

// =====================================================
// ROTAS DE API
// =====================================================

app.get('/ping', (req, res) => {
  res.json({
    status: 'ok',
    projeto: 'SPYTRAP',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/traps', trapsRoutes);
app.use('/api/heatmap', heatmapRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/capturas', capturasRoutes);

// =====================================================
// 404 - precisa ficar depois dos arquivos estáticos e APIs
// =====================================================

app.use((req, res) => {
  res.status(404).json({
    error: 'rota_nao_encontrada',
    message: `Rota ${req.method} ${req.path} não existe.`,
  });
});

// =====================================================
// ERRO GERAL
// =====================================================

app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);

  res.status(500).json({
    error: 'erro_interno',
    message: 'Erro interno do servidor.',
  });
});

// =====================================================
// INICIAR SERVIDOR
// =====================================================

app.listen(PORT, () => {
  console.log(`SPYTRAP API rodando na porta ${PORT}`);
  console.log(
    `Supabase: ${process.env.SUPABASE_URL ? 'configurado' : 'SUPABASE_URL nao definido'}`
  );
  console.log(
    `JWT: ${process.env.JWT_SECRET ? 'configurado' : 'JWT_SECRET nao definido'}`
  );
});