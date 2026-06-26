# SQL scripts

Use este diretório para scripts SQL executados contra o banco Supabase.

1. Configure `DATABASE_URL` no `.env`.
2. Teste a conexão:

```powershell
docker compose run --rm db 'psql "$DATABASE_URL" -f sql/inspect.sql'
```

3. Para abrir um console SQL:

```powershell
docker compose run --rm db
```
