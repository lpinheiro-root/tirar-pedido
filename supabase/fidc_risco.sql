-- Mensal FIDC: planilha "RISCO GERAL OPERAÇÕES FIDCs <MÊS> <ANO>" importada pelo financeiro.
-- Posição em aberto (a vencer / vencidos) de cada empresa em cada FIDC, uma vez por mês.

create table if not exists public.fidc_risco_meses (
  mes date primary key,                  -- primeiro dia do mês (2026-11-01)
  data_posicao date,                     -- data que vem no topo da aba BASE
  arquivo text,
  usuario_id uuid references auth.users(id),
  usuario_nome text,
  importado_em timestamptz not null default now()
);

create table if not exists public.fidc_risco (
  id bigint generated always as identity primary key,
  mes date not null references public.fidc_risco_meses(mes) on delete cascade,
  ordem int not null,                    -- ordem da linha na aba BASE
  empresa text not null,                 -- como vem na planilha ("ROMA", "VENEZA RJ")
  fidc text not null,                    -- como vem na planilha ("Crescer", "Previa")
  a_vencer numeric(14,2) not null default 0,
  vencidos numeric(14,2) not null default 0,
  unique (mes, ordem)
);
create index if not exists fidc_risco_mes_idx on public.fidc_risco (mes);

alter table public.fidc_risco_meses enable row level security;
alter table public.fidc_risco enable row level security;
grant select, insert, update, delete on public.fidc_risco_meses, public.fidc_risco to service_role;
grant usage, select on all sequences in schema public to service_role;
