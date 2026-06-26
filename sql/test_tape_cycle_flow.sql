begin;

insert into public.armadilhas (
  identificador,
  nome,
  latitude,
  longitude,
  status,
  ativo
) values (
  'SPY-TEST-CYCLE',
  'SPYTRAP TEST CYCLE',
  -19.0,
  -47.0,
  'online',
  true
) returning id as armadilha_id \gset

insert into public.ciclos_fita (armadilha_id, iniciado_em, status)
values (:'armadilha_id', '2026-06-25 08:00:00+00', 'ativo')
returning id as ciclo_id \gset

insert into public.capturas (
  armadilha_id,
  ciclo_fita_id,
  capturada_em,
  total_insetos,
  insetos_novos,
  nivel,
  confianca_ia,
  imagem_url
) values
  (:'armadilha_id', :'ciclo_id', '2026-06-25 09:00:00+00', 3, 3, 'low', 90, 'teste-1.jpeg'),
  (:'armadilha_id', :'ciclo_id', '2026-06-26 09:00:00+00', 5, 2, 'low', 90, 'teste-2.jpeg'),
  (:'armadilha_id', :'ciclo_id', '2026-06-27 09:00:00+00', 9, 4, 'low', 90, 'teste-3.jpeg');

select
  sum(insetos_novos) as soma_3_dias_ciclo_atual
from public.capturas
where ciclo_fita_id = :'ciclo_id';

select public.registrar_troca_fita(
  :'armadilha_id',
  '2026-06-26 08:00:00+00',
  'troca retroativa de teste'
) as resultado_troca \gset

select :'resultado_troca'::jsonb -> 'current' ->> 'id' as novo_ciclo_id \gset

select
  count(*) filter (where status = 'ativo') as ciclos_ativos,
  count(*) filter (where status = 'encerrado') as ciclos_encerrados
from public.ciclos_fita
where armadilha_id = :'armadilha_id';

select
  count(*) as capturas_preservadas_no_ciclo_anterior
from public.capturas
where ciclo_fita_id = :'ciclo_id';

select
  count(*) as capturas_realocadas_novo_ciclo,
  sum(insetos_novos) as soma_novo_ciclo
from public.capturas
where ciclo_fita_id = :'novo_ciclo_id';

select set_config('app.test_armadilha_id', :'armadilha_id', true);

do $$
begin
  perform public.registrar_troca_fita(
    current_setting('app.test_armadilha_id')::uuid,
    '2026-06-25 12:00:00+00',
    'deve bloquear por ciclo posterior'
  );
  raise exception 'falha: conflito esperado nao ocorreu';
exception
  when others then
    if sqlerrm not like '%conflito_ciclo_posterior%' then
      raise;
    end if;
end;
$$;

rollback;
