begin;

create or replace function public.recalcular_capturas_ciclos(p_armadilha_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linked integer := 0;
  v_recalculated integer := 0;
begin
  update public.capturas c
  set ciclo_fita_id = cf.id
  from public.ciclos_fita cf
  where c.armadilha_id = cf.armadilha_id
    and (p_armadilha_id is null or c.armadilha_id = p_armadilha_id)
    and c.capturada_em >= cf.iniciado_em
    and (cf.encerrado_em is null or c.capturada_em < cf.encerrado_em)
    and c.ciclo_fita_id is distinct from cf.id;

  get diagnostics v_linked = row_count;

  with ordenadas as (
    select
      c.id,
      c.total_insetos,
      coalesce(
        max(c.total_insetos) over (
          partition by c.ciclo_fita_id
          order by c.capturada_em, c.criado_em, c.id
          rows between unbounded preceding and 1 preceding
        ),
        0
      ) as total_anterior
    from public.capturas c
    where c.ciclo_fita_id is not null
      and (p_armadilha_id is null or c.armadilha_id = p_armadilha_id)
  )
  update public.capturas c
  set insetos_novos = greatest(ordenadas.total_insetos - ordenadas.total_anterior, 0)
  from ordenadas
  where c.id = ordenadas.id
    and c.insetos_novos is distinct from greatest(ordenadas.total_insetos - ordenadas.total_anterior, 0);

  get diagnostics v_recalculated = row_count;

  return jsonb_build_object(
    'linkedCaptures', v_linked,
    'recalculatedCaptures', v_recalculated
  );
end;
$$;

create or replace function public.preparar_captura_ciclo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle_id uuid;
  v_previous_total integer := 0;
begin
  select id
  into v_cycle_id
  from public.ciclos_fita
  where armadilha_id = new.armadilha_id
    and new.capturada_em >= iniciado_em
    and (encerrado_em is null or new.capturada_em < encerrado_em)
  order by iniciado_em desc
  limit 1;

  if v_cycle_id is not null then
    new.ciclo_fita_id := v_cycle_id;

    select coalesce(max(total_insetos), 0)
    into v_previous_total
    from public.capturas
    where ciclo_fita_id = v_cycle_id
      and capturada_em < new.capturada_em
      and (tg_op <> 'UPDATE' or id <> new.id);

    new.insetos_novos := greatest(coalesce(new.total_insetos, 0) - v_previous_total, 0);
  end if;

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_preparar_captura_ciclo'
  ) then
    create trigger trg_preparar_captura_ciclo
    before insert or update of armadilha_id, capturada_em, total_insetos, ciclo_fita_id
    on public.capturas
    for each row
    execute function public.preparar_captura_ciclo();
  end if;
end;
$$;

commit;
