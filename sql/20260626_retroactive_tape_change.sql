begin;

alter table public.ciclos_fita
  add column if not exists observacao text;

create or replace function public.registrar_troca_fita(
  p_armadilha_id uuid,
  p_effective_at timestamptz,
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous public.ciclos_fita%rowtype;
  v_current public.ciclos_fita%rowtype;
  v_moved integer := 0;
begin
  if p_armadilha_id is null then
    raise exception 'armadilha_obrigatoria' using errcode = 'P0001';
  end if;

  if p_effective_at is null then
    raise exception 'data_troca_obrigatoria' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.ciclos_fita
    where armadilha_id = p_armadilha_id
      and iniciado_em = p_effective_at
  ) then
    raise exception 'ja_existe_ciclo_neste_horario' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.ciclos_fita
    where armadilha_id = p_armadilha_id
      and iniciado_em > p_effective_at
  ) then
    raise exception 'conflito_ciclo_posterior' using errcode = 'P0001';
  end if;

  select *
  into v_previous
  from public.ciclos_fita
  where armadilha_id = p_armadilha_id
    and iniciado_em < p_effective_at
    and (encerrado_em is null or encerrado_em > p_effective_at)
  order by iniciado_em desc
  limit 1;

  if v_previous.id is null then
    raise exception 'ciclo_anterior_nao_encontrado' using errcode = 'P0001';
  end if;

  update public.ciclos_fita
  set
    status = 'encerrado',
    encerrado_em = p_effective_at,
    atualizado_em = now()
  where id = v_previous.id
  returning * into v_previous;

  insert into public.ciclos_fita (
    armadilha_id,
    iniciado_em,
    status,
    observacao
  ) values (
    p_armadilha_id,
    p_effective_at,
    'ativo',
    nullif(trim(p_observacao), '')
  )
  returning * into v_current;

  update public.capturas
  set ciclo_fita_id = v_current.id
  where armadilha_id = p_armadilha_id
    and capturada_em >= p_effective_at;

  get diagnostics v_moved = row_count;

  with ordenadas as (
    select
      id,
      total_insetos,
      coalesce(
        max(total_insetos) over (
          partition by ciclo_fita_id
          order by capturada_em, criado_em, id
          rows between unbounded preceding and 1 preceding
        ),
        0
      ) as total_anterior
    from public.capturas
    where ciclo_fita_id in (v_previous.id, v_current.id)
  )
  update public.capturas c
  set insetos_novos = greatest(ordenadas.total_insetos - ordenadas.total_anterior, 0)
  from ordenadas
  where c.id = ordenadas.id;

  return jsonb_build_object(
    'previous', to_jsonb(v_previous),
    'current', to_jsonb(v_current),
    'movedCaptures', v_moved
  );
end;
$$;

commit;
