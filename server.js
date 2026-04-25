require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const trapsRoutes = require('./routes/traps');
const heatmapRoutes = require('./routes/heatmap');
const reportsRoutes = require('./routes/reports');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));

app.use(express.json());

app.get('/ping', (req, res) => {
  res.json({ status: 'ok', projeto: 'SPYTRAP', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/traps', trapsRoutes);
app.use('/api/heatmap', heatmapRoutes);
app.use('/api/reports', reportsRoutes);

app.use((req, res) => {
  res.status(404).json({
    error: 'rota_nao_encontrada',
    message: `Rota ${req.method} ${req.path} não existe.`,
  });
});

app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  res.status(500).json({
    error: 'erro_interno',
    message: 'Erro interno do servidor.',
  });
});

app.listen(PORT, () => {
  console.log(`SPYTRAP API rodando na porta ${PORT}`);
  console.log(`Supabase: ${process.env.SUPABASE_URL ? 'configurado' : 'SUPABASE_URL nao definido'}`);
  console.log(`JWT: ${process.env.JWT_SECRET ? 'configurado' : 'JWT_SECRET nao definido'}`);
});
