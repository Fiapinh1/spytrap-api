# 🌱 AgroSentinel — Guia de Configuração do Backend

## O que você vai configurar

```
Supabase (banco)  ←→  Node.js/Express (API)  ←→  HTML (frontend)
     ↑                        ↑
 Cria a tabela           Render.com
  de usuários             (hospedagem)
```

---

## PASSO 1 — Criar projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) e faça login
2. Clique em **"New project"**
3. Preencha:
   - **Name:** `agrosentinel`
   - **Database Password:** crie uma senha forte e **guarde**
   - **Region:** escolha `South America (São Paulo)`
4. Aguarde o projeto ser criado (~2 min)

---

## PASSO 2 — Criar a tabela de usuários

1. No painel Supabase, vá em **SQL Editor → New query**
2. Cole o conteúdo do arquivo `supabase_setup.sql`
3. Clique em **Run** (▶)
4. Verifique que a tabela `usuarios` aparece em **Table Editor**

---

## PASSO 3 — Pegar as credenciais do Supabase

1. Vá em **Settings → API**
2. Copie:
   - **Project URL** → vai para `SUPABASE_URL` no `.env`
   - **service_role** (secret) → vai para `SUPABASE_SERVICE_KEY` no `.env`

> ⚠️ Use sempre a `service_role`, nunca a `anon key` no backend.

---

## PASSO 4 — Configurar o projeto local

```bash
# 1. Abra o terminal na pasta do backend
cd caminho/para/backend

# 2. Instale as dependências
npm install

# 3. Copie o arquivo de variáveis
cp .env.example .env
```

Abra o arquivo `.env` e preencha:

```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGci...
JWT_SECRET=cole_aqui_resultado_do_comando_abaixo
FRONTEND_URL=*
```

Para gerar o JWT_SECRET, rode no terminal:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```
Cole o resultado no `.env`.

---

## PASSO 5 — Criar o primeiro usuário (admin)

```bash
node criar-admin.js
```

O script vai perguntar nome, e-mail, senha e perfil.  
Use `admin` como perfil para ter acesso total.

---

## PASSO 6 — Testar localmente

```bash
npm run dev
```

Deve aparecer:
```
🌱 AgroSentinel API rodando na porta 3000
   Supabase: ✅ configurado
   JWT:      ✅ configurado
```

Teste no navegador: `http://localhost:3000/ping`  
Deve retornar: `{ "status": "ok", ... }`

---

## PASSO 7 — Deploy no Render.com

1. Acesse [render.com](https://render.com) e faça login
2. Clique em **"New +" → "Web Service"**
3. Conecte seu repositório GitHub (ou use "Deploy from files")
4. Configure:
   - **Name:** `agrosentinel-api`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Em **Environment Variables**, adicione as mesmas variáveis do `.env`:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `JWT_SECRET`
   - `FRONTEND_URL` → `*` (ou o domínio real depois)
6. Clique em **"Create Web Service"**
7. Aguarde o deploy (~3 min)
8. Copie a URL gerada: `https://agrosentinel-api.onrender.com`

---

## PASSO 8 — Atualizar a URL no frontend

Nos arquivos `index.html` e `login.html`, substitua a URL da API:

**login.html** — linha com `API_BASE_URL`:
```javascript
const API_BASE_URL = 'https://agrosentinel-api.onrender.com';
```

**index.html** — dentro do objeto `API`:
```javascript
BASE_URL: 'https://agrosentinel-api.onrender.com',
```

---

## PASSO 9 — Keep-alive (evitar o Render adormecer)

O Render gratuito adormece após 15 min sem uso. Configure o UptimeRobot:

1. Acesse [uptimerobot.com](https://uptimerobot.com) (gratuito)
2. Crie um monitor **HTTP(S)**
3. URL: `https://agrosentinel-api.onrender.com/ping`
4. Intervalo: **5 minutos**

---

## Estrutura de arquivos

```
backend/
├── server.js              ← servidor principal
├── package.json           ← dependências
├── .env.example           ← modelo das variáveis (commitar)
├── .env                   ← variáveis reais (NÃO commitar)
├── criar-admin.js         ← script para criar o 1º usuário
├── supabase_setup.sql     ← SQL para criar a tabela
├── routes/
│   └── auth.js            ← login, logout, me, forgot-password
└── middleware/
    └── authMiddleware.js  ← validação do JWT
```

---

## Endpoints da API

| Método | Rota | Descrição | Auth? |
|--------|------|-----------|-------|
| GET | `/ping` | Health check | Não |
| POST | `/api/auth/login` | Fazer login | Não |
| POST | `/api/auth/logout` | Fazer logout | Sim |
| GET | `/api/auth/me` | Dados do usuário logado | Sim |
| POST | `/api/auth/forgot-password` | Recuperar senha | Não |
| GET | `/api/auth/usuarios` | Listar usuários (admin) | Sim |

---

## Perfis de acesso

| Perfil | O que pode fazer |
|--------|-----------------|
| `admin` | Tudo — inclusive listar usuários |
| `operador` | Login, visualizar dashboard |

---

## Dúvidas frequentes

**O login funciona mas o dashboard não carrega os dados da armadilha?**  
Os dados da armadilha ainda são mock (dados de teste). Quando o colega responsável pela API entregar os endpoints, basta descomentar os blocos `// ── REAL ──` no objeto `API` do `index.html`.

**Como adicionar mais usuários?**  
Rode `node criar-admin.js` novamente para cada novo usuário, ou crie diretamente na tabela pelo painel do Supabase (lembre de gerar o hash com bcrypt).

**Como desativar um usuário sem excluir?**  
No Supabase → Table Editor → `usuarios` → edite o registro e mude `ativo` para `false`.
