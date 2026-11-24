-- Inadimplência: acesso por usuário e uma "foto" por dia do total vencido (para a evolução mês a mês;
-- o ORGM só mostra o que está em aberto hoje).
alter table public.representantes
  add column if not exists acesso_inadimplencia boolean not null default false;

create table if not exists public.inadimplencia_fotos (
  dia date not null,
  empresa_id text not null,
  empresa text,
  tipo text not null,            -- fidc / banco / carteira / outra
  qtd int not null default 0,
  saldo numeric(16,2) not null default 0,
  atualizado_em timestamptz not null default now(),
  primary key (dia, empresa_id, tipo)
);
alter table public.inadimplencia_fotos enable row level security;
grant select, insert, update, delete on public.inadimplencia_fotos to service_role;
