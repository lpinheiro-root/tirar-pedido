-- Natuhair — Conciliação de fatura de cartão
-- Rodar no SQL editor do Supabase depois de schema.sql (usa public.is_admin()).

-- ─────────────────────────────────────────────────────────────
-- cartao_compras
-- Compras feitas nos sites (Mercado Livre via API, demais via planilha
-- ou cadastro manual). Para o Mercado Livre, cada linha é um pagamento
-- (um carrinho com vários pedidos gera uma única cobrança no cartão).
-- ─────────────────────────────────────────────────────────────
create table if not exists public.cartao_compras (
  id uuid primary key default gen_random_uuid(),
  origem text not null check (origem in ('mercadolivre', 'shopee', 'magalu', 'amazon', 'outro')),
  conta text,
  pedido_externo text,
  data date not null,
  loja text,
  descricao text,
  valor_total numeric(12, 2) not null check (valor_total > 0),
  parcelas integer not null default 1 check (parcelas between 1 and 48),
  valor_parcela numeric(12, 2),
  fonte text not null check (fonte in ('api', 'importacao', 'manual')),
  criado_em timestamptz not null default now(),
  unique (origem, pedido_externo)
);

create index if not exists cartao_compras_data_idx on public.cartao_compras (data desc);

-- ─────────────────────────────────────────────────────────────
-- cartao_faturas / cartao_lancamentos
-- ─────────────────────────────────────────────────────────────
create table if not exists public.cartao_faturas (
  id uuid primary key default gen_random_uuid(),
  banco text not null,
  arquivo_nome text not null,
  arquivo_hash text not null unique,
  vencimento date,
  total numeric(12, 2),
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now()
);

create index if not exists cartao_faturas_vencimento_idx on public.cartao_faturas (vencimento desc);

create table if not exists public.cartao_lancamentos (
  id uuid primary key default gen_random_uuid(),
  fatura_id uuid not null references public.cartao_faturas (id) on delete cascade,
  ordem integer not null,
  data date not null,
  descricao text not null,
  valor numeric(12, 2) not null,
  tipo text not null check (tipo in ('compra', 'estorno', 'pagamento', 'encargo')),
  parcela_atual integer,
  parcela_total integer,
  cartao_final text,
  status text not null default 'pendente'
    check (status in ('pendente', 'conciliado', 'divergente', 'ignorado')),
  compra_id uuid references public.cartao_compras (id) on delete set null,
  vinculo text check (vinculo in ('auto', 'manual')),
  diferenca numeric(12, 2),
  observacao text
);

create index if not exists cartao_lancamentos_fatura_idx on public.cartao_lancamentos (fatura_id, ordem);
create index if not exists cartao_lancamentos_compra_idx on public.cartao_lancamentos (compra_id);

-- ─────────────────────────────────────────────────────────────
-- cartao_integracoes
-- Tokens OAuth das contas da empresa nos marketplaces. Sem policies:
-- só o service role (servidor) lê e grava — tokens nunca vão ao browser.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.cartao_integracoes (
  id uuid primary key default gen_random_uuid(),
  provedor text not null check (provedor in ('mercadolivre')),
  usuario_externo_id text not null,
  apelido text not null,
  access_token text not null,
  refresh_token text not null,
  expira_em timestamptz not null,
  ultima_sincronizacao timestamptz,
  criado_em timestamptz not null default now(),
  unique (provedor, usuario_externo_id)
);

-- ─────────────────────────────────────────────────────────────
-- privilégios e RLS — apenas admin
-- ─────────────────────────────────────────────────────────────
grant select, insert, update, delete on public.cartao_compras to authenticated;
grant select, insert, update, delete on public.cartao_faturas to authenticated;
grant select, insert, update, delete on public.cartao_lancamentos to authenticated;

grant select, insert, update, delete on public.cartao_compras to service_role;
grant select, insert, update, delete on public.cartao_faturas to service_role;
grant select, insert, update, delete on public.cartao_lancamentos to service_role;
grant select, insert, update, delete on public.cartao_integracoes to service_role;

alter table public.cartao_compras enable row level security;
alter table public.cartao_faturas enable row level security;
alter table public.cartao_lancamentos enable row level security;
alter table public.cartao_integracoes enable row level security;

drop policy if exists cartao_compras_admin on public.cartao_compras;
create policy cartao_compras_admin on public.cartao_compras
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists cartao_faturas_admin on public.cartao_faturas;
create policy cartao_faturas_admin on public.cartao_faturas
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists cartao_lancamentos_admin on public.cartao_lancamentos;
create policy cartao_lancamentos_admin on public.cartao_lancamentos
  for all using (public.is_admin()) with check (public.is_admin());
