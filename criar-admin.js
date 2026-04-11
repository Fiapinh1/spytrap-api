/**
 * ══════════════════════════════════════════════════════
 *  criar-admin.js — AgroSentinel
 *  Cria o primeiro usuário administrador no banco.
 *
 *  USO (uma única vez, após configurar o .env):
 *    node criar-admin.js
 *
 *  Depois pode adicionar mais usuários pelo Supabase
 *  ou criar uma rota de gestão de usuários no futuro.
 * ══════════════════════════════════════════════════════
 */

require('dotenv').config();
const bcrypt         = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
const readline       = require('readline');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(resolve => rl.question(q, resolve));

async function main() {
  console.log('\n🌱 AgroSentinel — Criação de Usuário\n');

  const nome   = await ask('Nome completo: ');
  const email  = await ask('E-mail:        ');
  const senha  = await ask('Senha:         ');
  const perfil = await ask('Perfil (admin/operador) [admin]: ') || 'admin';

  if (!nome || !email || !senha) {
    console.error('\n❌ Nome, e-mail e senha são obrigatórios.\n');
    rl.close(); process.exit(1);
  }

  if (!['admin', 'operador'].includes(perfil)) {
    console.error('\n❌ Perfil inválido. Use "admin" ou "operador".\n');
    rl.close(); process.exit(1);
  }

  console.log('\nCriando usuário...');

  const senha_hash = await bcrypt.hash(senha, 12);

  const { data, error } = await supabase
    .from('usuarios')
    .insert({ nome, email: email.toLowerCase().trim(), senha_hash, perfil })
    .select('id, nome, email, perfil')
    .single();

  if (error) {
    if (error.code === '23505') {
      console.error('\n❌ Este e-mail já está cadastrado.\n');
    } else {
      console.error('\n❌ Erro ao criar usuário:', error.message, '\n');
    }
    rl.close(); process.exit(1);
  }

  console.log('\n✅ Usuário criado com sucesso!');
  console.log('   ID:     ', data.id);
  console.log('   Nome:   ', data.nome);
  console.log('   E-mail: ', data.email);
  console.log('   Perfil: ', data.perfil);
  console.log('\nAgora pode fazer login no sistema.\n');

  rl.close();
}

main().catch(err => {
  console.error('Erro inesperado:', err.message);
  rl.close(); process.exit(1);
});
