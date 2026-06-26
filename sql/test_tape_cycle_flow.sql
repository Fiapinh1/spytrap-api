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

update public.ciclos_fita
set
  status = 'encerrado',
  encerrado_em = '2026-06-28 08:00:00+00',
  atualizado_em = '2026-06-28 08:00:00+00'
where id = :'ciclo_id';

insert into public.ciclos_fita (armadilha_id, iniciado_em, status)
values (:'armadilha_id', '2026-06-28 08:00:00+00', 'ativo')
returning id as novo_ciclo_id \gset

select
  count(*) filter (where status = 'ativo') as ciclos_ativos,
  count(*) filter (where status = 'encerrado') as ciclos_encerrados
from public.ciclos_fita
where armadilha_id = :'armadilha_id';

select
  count(*) as capturas_preservadas_no_ciclo_anterior
from public.capturas
where ciclo_fita_id = :'ciclo_id';

rollback;
