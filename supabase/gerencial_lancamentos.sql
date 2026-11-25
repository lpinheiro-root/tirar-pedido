-- Relatório Gerencial: rubrica escolhida para um pagamento específico (vale por cima da rubrica da conta).
create table if not exists public.gerencial_lancamentos (
  fin_mov_id bigint not null,
  conta text not null,
  ano int not null,
  mes int not null check (mes between 1 and 12),
  valor numeric(16,2) not null,
  favorecido text,
  rubrica text not null,
  alterado_por text,
  alterado_em timestamptz not null default now(),
  primary key (fin_mov_id, conta)
);
create index if not exists gerencial_lancamentos_ano on public.gerencial_lancamentos (ano);
alter table public.gerencial_lancamentos enable row level security;
grant select, insert, update, delete on public.gerencial_lancamentos to service_role;
