begin;

create table if not exists public.ciclos_fita (
  id uuid primary key default gen_random_uuid(),
  armadilha_id uuid not null references public.armadilhas(id),
  iniciado_em timestamptz not null default now(),
  encerrado_em timestamptz,
  status text not null default 'ativo',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint ciclos_fita_status_check check (status in ('ativo', 'encerrado')),
  constraint ciclos_fita_periodo_check check (encerrado_em is null or encerrado_em >= iniciado_em)
);

create unique index if not exists idx_ciclos_fita_ativo_unico
  on public.ciclos_fita (armadilha_id)
  where status = 'ativo';

create index if not exists idx_ciclos_fita_armadilha_inicio
  on public.ciclos_fita (armadilha_id, iniciado_em desc);

alter table public.capturas
  add column if not exists ciclo_fita_id uuid references public.ciclos_fita(id);

alter table public.capturas
  add column if not exists insetos_novos integer not null default 0;

create index if not exists idx_capturas_ciclo_data
  on public.capturas (ciclo_fita_id, capturada_em desc);

create index if not exists idx_capturas_armadilha_ciclo_data
  on public.capturas (armadilha_id, ciclo_fita_id, capturada_em desc);

insert into public.ciclos_fita (armadilha_id, iniciado_em, status)
select
  a.id,
  coalesce(min(c.capturada_em), a.criado_em, now()) as iniciado_em,
  'ativo'
from public.armadilhas a
left join public.capturas c on c.armadilha_id = a.id
where not exists (
  select 1
  from public.ciclos_fita cf
  where cf.armadilha_id = a.id
    and cf.status = 'ativo'
)
group by a.id, a.criado_em;

update public.capturas c
set ciclo_fita_id = cf.id
from public.ciclos_fita cf
where c.armadilha_id = cf.armadilha_id
  and cf.status = 'ativo'
  and c.ciclo_fita_id is null;

with calculadas as (
  select
    c.id,
    greatest(
      c.total_insetos - coalesce(
        max(c.total_insetos) over (
          partition by c.ciclo_fita_id
          order by c.capturada_em, c.id
          rows between unbounded preceding and 1 preceding
        ),
        0
      ),
      0
    ) as novos
  from public.capturas c
  where c.ciclo_fita_id is not null
)
update public.capturas c
set insetos_novos = calculadas.novos
from calculadas
where c.id = calculadas.id;

alter table public.ciclos_fita enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ciclos_fita'
      and policyname = 'service_role acesso total'
  ) then
    create policy "service_role acesso total"
      on public.ciclos_fita
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end $$;

commit;
