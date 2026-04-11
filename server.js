require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const authRoutes = require('./routes/auth');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── CORS ────────────────────────────────────────────────────────────────────
// Permite que o frontend HTML chame esta API.
// Em produção, troque FRONTEND_URL para o domínio real (ex: https://meusite.com)
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));

// ── BODY PARSER ─────────────────────────────────────────────────────────────
app.use(express.json());

// ── PING — keep-alive para o Render.com não adormecer ───────────────────────
// Configure o UptimeRobot para chamar esta rota a cada 14 minutos.
// URL: https://seu-projeto.onrender.com/ping
app.get('/ping', (req, res) => {
  res.json({ status: 'ok', projeto: 'AgroSentinel', timestamp: new Date().toISOString() });
});

// ── ROTAS ────────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);

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
  console.log(`🌱 AgroSentinel API rodando na porta ${PORT}`);
  console.log(`   Supabase: ${process.env.SUPABASE_URL ? '✅ configurado' : '❌ SUPABASE_URL não definido'}`);
  console.log(`   JWT:      ${process.env.JWT_SECRET    ? '✅ configurado' : '❌ JWT_SECRET não definido'}`);
});
