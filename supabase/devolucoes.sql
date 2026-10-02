-- Natuhair Finanças — Devoluções (NFD) e acompanhamento da equipe
-- Rodar no SQL editor do Supabase.

-- ─────────────────────────────────────────────────────────────
-- dados da NF-e usados no controle de devoluções (preenchidos pelo robô)
-- ─────────────────────────────────────────────────────────────
alter table public.cartao_notas
  add column if not exists tipo text check (tipo in ('compra', 'devolucao', 'outra')),
  -- 'cliente' = NFD emitida pelo cliente; 'propria' = nota de entrada emitida pela própria empresa
  add column if not exists devolucao_origem text check (devolucao_origem in ('cliente', 'propria')),
  add column if not exists cliente_nome text,
  add column if not exists cliente_doc text,
  add column if not exists cliente_uf text,
  add column if not exists empresa_uf text,
  add column if not exists notas_origem text[],
  add column if not exists transportadora text;

create index if not exists cartao_notas_tipo_idx on public.cartao_notas (tipo, data_emissao desc);

-- ─────────────────────────────────────────────────────────────
-- quem pode ver e preencher as devoluções (além do super admin)
-- ─────────────────────────────────────────────────────────────
alter table public.representantes
  add column if not exists acesso_devolucoes boolean not null default false;

create or replace function public.pode_ver_devolucoes()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.representantes
    where id = auth.uid() and ativo and (super_admin or acesso_devolucoes)
  );
$$;

drop policy if exists cartao_notas_devolucoes on public.cartao_notas;
create policy cartao_notas_devolucoes on public.cartao_notas
  for select using (tipo = 'devolucao' and public.pode_ver_devolucoes());

-- ─────────────────────────────────────────────────────────────
-- acompanhamento preenchido pela equipe (uma linha por NFD)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.devolucoes_acompanhamento (
  chave text primary key references public.cartao_notas (chave) on delete cascade,
  motivo text,
  volta_fabrica text,
  retorno text,
  transportadora text,
  transportadora_debitada text,
  pagamento_cliente text,
  pagamento_feito text,
  status text,
  nf_fiscal text,
  atualizado_por uuid references auth.users (id) on delete set null,
  atualizado_em timestamptz not null default now()
);

alter table public.devolucoes_acompanhamento enable row level security;
grant select, insert, update on public.devolucoes_acompanhamento to authenticated;
grant select, insert, update, delete on public.devolucoes_acompanhamento to service_role;

drop policy if exists devolucoes_acomp_select on public.devolucoes_acompanhamento;
create policy devolucoes_acomp_select on public.devolucoes_acompanhamento
  for select using (public.pode_ver_devolucoes());

drop policy if exists devolucoes_acomp_insert on public.devolucoes_acompanhamento;
create policy devolucoes_acomp_insert on public.devolucoes_acompanhamento
  for insert with check (public.pode_ver_devolucoes());

drop policy if exists devolucoes_acomp_update on public.devolucoes_acompanhamento;
create policy devolucoes_acomp_update on public.devolucoes_acompanhamento
  for update using (public.pode_ver_devolucoes()) with check (public.pode_ver_devolucoes());
