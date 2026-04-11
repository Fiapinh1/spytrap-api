const express        = require('express');
const bcrypt         = require('bcryptjs');
const jwt            = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// Cria o cliente Supabase com a service key (acesso total, bypassa RLS)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ════════════════════════════════════════════════════════════
//  POST /api/auth/login
//  Body: { email, password, remember }
//  Retorna: { token, user: { id, nome, email, perfil } }
// ════════════════════════════════════════════════════════════
router.post('/login', async (req, res) => {
  try {
    const { email, password, remember } = req.body;

    // Validação básica
    if (!email || !password) {
      return res.status(422).json({
        error:   'campos_obrigatorios',
        message: 'E-mail e senha são obrigatórios.',
      });
    }

    // Busca o usuário pelo e-mail (só ativos)
    const { data: user, error } = await supabase
      .from('usuarios')
      .select('id, nome, email, senha_hash, perfil, ativo')
      .eq('email', email.toLowerCase().trim())
      .eq('ativo', true)
      .single();

    // Usuário não encontrado ou erro no banco
    if (error || !user) {
      return res.status(401).json({
        error:   'credenciais_invalidas',
        message: 'E-mail ou senha incorretos.',
      });
    }

    // Verifica a senha contra o hash salvo
    const senhaCorreta = await bcrypt.compare(password, user.senha_hash);
    if (!senhaCorreta) {
      return res.status(401).json({
        error:   'credenciais_invalidas',
        message: 'E-mail ou senha incorretos.',
      });
    }

    // Atualiza o campo ultimo_login
    await supabase
      .from('usuarios')
      .update({ ultimo_login: new Date().toISOString() })
      .eq('id', user.id);

    // Gera o JWT — expira em 30 dias se "manter conectado", ou 8h
    const expiresIn = remember ? '30d' : '8h';
    const token = jwt.sign(
      { id: user.id, email: user.email, perfil: user.perfil, nome: user.nome },
      process.env.JWT_SECRET,
      { expiresIn }
    );

    return res.json({
      token,
      user: {
        id:     user.id,
        nome:   user.nome,
        email:  user.email,
        perfil: user.perfil,
      },
    });

  } catch (err) {
    console.error('Erro no login:', err.message);
    return res.status(500).json({
      error:   'erro_servidor',
      message: 'Erro interno. Tente novamente.',
    });
  }
});

// ════════════════════════════════════════════════════════════
//  POST /api/auth/logout  (requer token válido)
//  JWT é stateless — o frontend descarta o token.
//  Este endpoint existe para registrar o logout no futuro
//  (ex.: blacklist de tokens, auditoria).
// ════════════════════════════════════════════════════════════
router.post('/logout', authMiddleware, (req, res) => {
  // TODO: se quiser revogar tokens, implemente uma blacklist aqui
  return res.json({ success: true, message: 'Logout realizado com sucesso.' });
});

// ════════════════════════════════════════════════════════════
//  GET /api/auth/me  (requer token válido)
//  Valida o token e retorna os dados atualizados do usuário.
//  O frontend chama esta rota ao abrir o dashboard para
//  confirmar que a sessão ainda é válida.
// ════════════════════════════════════════════════════════════
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('usuarios')
      .select('id, nome, email, perfil, criado_em, ultimo_login')
      .eq('id', req.user.id)
      .eq('ativo', true)
      .single();

    if (error || !user) {
      return res.status(401).json({
        error:   'usuario_inativo',
        message: 'Usuário não encontrado ou desativado.',
      });
    }

    return res.json({ user });

  } catch (err) {
    console.error('Erro no /me:', err.message);
    return res.status(500).json({ error: 'erro_servidor', message: 'Erro interno.' });
  }
});

// ════════════════════════════════════════════════════════════
//  POST /api/auth/forgot-password
//  Body: { email }
//  TODO: integrar com serviço de e-mail (ex: Resend, SendGrid)
// ════════════════════════════════════════════════════════════
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(422).json({ error: 'email_obrigatorio', message: 'E-mail é obrigatório.' });
  }

  // Por segurança, sempre retornamos sucesso (não revelamos se o e-mail existe)
  // TODO: verificar se existe, gerar token de reset, enviar e-mail
  console.log(`[forgot-password] Solicitação para: ${email}`);

  return res.json({
    success: true,
    message: 'Se o e-mail estiver cadastrado, as instruções serão enviadas.',
  });
});

// ════════════════════════════════════════════════════════════
//  GET /api/auth/usuarios  (somente admin)
//  Lista todos os usuários do sistema.
// ════════════════════════════════════════════════════════════
router.get('/usuarios', authMiddleware, async (req, res) => {
  if (req.user.perfil !== 'admin') {
    return res.status(403).json({ error: 'sem_permissao', message: 'Acesso restrito a administradores.' });
  }

  try {
    const { data: usuarios, error } = await supabase
      .from('usuarios')
      .select('id, nome, email, perfil, ativo, criado_em, ultimo_login')
      .order('criado_em', { ascending: false });

    if (error) throw error;
    return res.json({ usuarios });

  } catch (err) {
    console.error('Erro ao listar usuários:', err.message);
    return res.status(500).json({ error: 'erro_servidor', message: 'Erro interno.' });
  }
});

module.exports = router;
