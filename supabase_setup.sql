-- ══════════════════════════════════════════════════════════════
--  AgroSentinel — Setup do banco de dados (Supabase)
--  Execute este SQL no Supabase SQL Editor:
--  painel Supabase → SQL Editor → New query → cole e execute
-- ══════════════════════════════════════════════════════════════


-- ── TABELA DE USUÁRIOS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome         TEXT        NOT NULL,
  email        TEXT        NOT NULL UNIQUE,
  senha_hash   TEXT        NOT NULL,
  perfil       TEXT        NOT NULL DEFAULT 'operador'
                           CHECK (perfil IN ('admin', 'operador')),
  ativo        BOOLEAN     NOT NULL DEFAULT true,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ultimo_login TIMESTAMPTZ
);

-- Índice para busca por e-mail (login rápido)
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios (email);


-- ── ROW LEVEL SECURITY ─────────────────────────────────────
-- Ativamos RLS para proteção extra.
-- O backend usa a service_key que bypassa o RLS,
-- então esta regra bloqueia acesso direto não autorizado.
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;

-- Somente a service role (backend) pode acessar a tabela
CREATE POLICY "Somente service role" ON usuarios
  USING (auth.role() = 'service_role');


-- ── VERIFICAR RESULTADO ────────────────────────────────────
-- Execute esta linha para confirmar que a tabela foi criada:
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'usuarios'
ORDER BY ordinal_position;
