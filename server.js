require('dotenv').config();
const express = require('express');
const cors    = require('cors');

<<<<<<< HEAD
const authRoutes    = require('./routes/auth');
const trapsRoutes   = require('./routes/traps');
const heatmapRoutes = require('./routes/heatmap');   // ← novo
const reportsRoutes = require('./routes/reports');   // ← novo
=======
const authRoutes  = require('./routes/auth');
const trapsRoutes = require('./routes/traps'); // ← novo
>>>>>>> b094c2f (Atualiza front-end para integração com imagens do Supabase)

const app  = express();
const PORT = process.env.PORT || 3000;

// ── CORS ────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));

// ── BODY PARSER ─────────────────────────────────────────────────────────────
app.use(express.json());

// ── PING — keep-alive para o Render.com não adormecer ───────────────────────
app.get('/ping', (req, res) => {
  res.json({ status: 'ok', projeto: 'SPYTRAP', timestamp: new Date().toISOString() });
});

// ── ROTAS ────────────────────────────────────────────────────────────────────
<<<<<<< HEAD
app.use('/api/auth',    authRoutes);
app.use('/api/traps',   trapsRoutes);
app.use('/api/heatmap', heatmapRoutes);  // ← novo
app.use('/api/reports', reportsRoutes);  // ← novo
=======
app.use('/api/auth',  authRoutes);
app.use('/api/traps', trapsRoutes); // ← novo
>>>>>>> b094c2f (Atualiza front-end para integração com imagens do Supabase)

// ── 404 ─────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'rota_nao_encontrada', message: `Rota ${req.method} ${req.path} não existe.` });
});

// ── ERRO GLOBAL ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  res.status(500).json({ error: 'erro_interno', message: 'Erro interno do servidor.' });
});

// ── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🌱 SPYTRAP API rodando na porta ${PORT}`);
  console.log(`   Supabase: ${process.env.SUPABASE_URL ? '✅ configurado' : '❌ SUPABASE_URL não definido'}`);
  console.log(`   JWT:      ${process.env.JWT_SECRET    ? '✅ configurado' : '❌ JWT_SECRET não definido'}`);
});