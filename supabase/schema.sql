-- Natuhair Pedidos — Supabase schema
-- Run in the Supabase SQL editor (or via `supabase db push`).

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- representantes
-- ─────────────────────────────────────────────────────────────
create table if not exists public.representantes (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null,
  email text not null unique,
  telefone text,
  estado text not null,
  codigo_representante_sql text not null,
  role text not null default 'representante' check (role in ('representante', 'admin')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create index if not exists representantes_estado_idx on public.representantes (estado);
create index if not exists representantes_role_idx on public.representantes (role);

-- ─────────────────────────────────────────────────────────────
-- pedidos
-- ─────────────────────────────────────────────────────────────
create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  representante_id uuid not null references public.representantes (id) on delete cascade,
  cliente_id_sql text not null,
  cliente_nome text not null,
  status text not null default 'enviado' check (status in ('enviado', 'processando', 'faturado', 'cancelado')),
  excel_url text,
  enviado_email boolean not null default false,
  enviado_whatsapp boolean not null default false,
  criado_em timestamptz not null default now()
);

create index if not exists pedidos_representante_idx on public.pedidos (representante_id);
create index if not exists pedidos_cliente_idx on public.pedidos (cliente_id_sql);
create index if not exists pedidos_criado_em_idx on public.pedidos (criado_em desc);

-- ─────────────────────────────────────────────────────────────
-- pedido_itens
-- ─────────────────────────────────────────────────────────────
create table if not exists public.pedido_itens (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos (id) on delete cascade,
  produto_id_sql text not null,
  produto_nome text not null,
  produto_imagem_url text,
  quantidade integer not null check (quantidade > 0),
  preco_unitario numeric(10, 2) not null check (preco_unitario >= 0),
  subtotal numeric(10, 2) not null check (subtotal >= 0)
);

create index if not exists pedido_itens_pedido_idx on public.pedido_itens (pedido_id);

-- ─────────────────────────────────────────────────────────────
-- produtos_config
-- Camada de override sobre os produtos do SQL Server externo (somente
-- leitura): permite ao admin ativar/desativar um produto no catálogo do
-- app sem escrever no banco externo.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.produtos_config (
  produto_id_sql text primary key,
  ativo boolean not null default true,
  preco_override numeric(10, 2),
  atualizado_em timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- helper: papel do usuário autenticado
-- ─────────────────────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.representantes
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ─────────────────────────────────────────────────────────────
-- privilégios de tabela — RLS por si só não concede acesso; sem
-- estes GRANTs a role authenticated recebe 403 em qualquer request,
-- independentemente das policies abaixo.
-- ─────────────────────────────────────────────────────────────
grant select, insert, update on public.representantes to authenticated;
grant select, insert, update on public.pedidos to authenticated;
grant select, insert on public.pedido_itens to authenticated;
grant select, insert, update on public.produtos_config to authenticated;

-- service_role (usado pelas rotas administrativas via createServiceRoleClient)
-- também precisa de GRANT explícito — não vem liberado por padrão.
grant select, insert, update, delete on public.representantes to service_role;
grant select, insert, update, delete on public.pedidos to service_role;
grant select, insert, update, delete on public.pedido_itens to service_role;
grant select, insert, update, delete on public.produtos_config to service_role;

-- ─────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────
alter table public.representantes enable row level security;
alter table public.pedidos enable row level security;
alter table public.pedido_itens enable row level security;
alter table public.produtos_config enable row level security;

-- representantes: cada um vê/edita a própria linha; admin vê tudo
drop policy if exists representantes_select on public.representantes;
create policy representantes_select on public.representantes
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists representantes_update on public.representantes;
create policy representantes_update on public.representantes
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists representantes_insert on public.representantes;
create policy representantes_insert on public.representantes
  for insert with check (public.is_admin());

-- pedidos: representante vê/insere os seus; admin vê e atualiza todos
drop policy if exists pedidos_select on public.pedidos;
create policy pedidos_select on public.pedidos
  for select using (representante_id = auth.uid() or public.is_admin());

drop policy if exists pedidos_insert on public.pedidos;
create policy pedidos_insert on public.pedidos
  for insert with check (representante_id = auth.uid() or public.is_admin());

drop policy if exists pedidos_update on public.pedidos;
create policy pedidos_update on public.pedidos
  for update using (public.is_admin()) with check (public.is_admin());

-- pedido_itens: segue a visibilidade do pedido pai
drop policy if exists pedido_itens_select on public.pedido_itens;
create policy pedido_itens_select on public.pedido_itens
  for select using (
    exists (
      select 1 from public.pedidos p
      where p.id = pedido_itens.pedido_id
        and (p.representante_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists pedido_itens_insert on public.pedido_itens;
create policy pedido_itens_insert on public.pedido_itens
  for insert with check (
    exists (
      select 1 from public.pedidos p
      where p.id = pedido_itens.pedido_id
        and (p.representante_id = auth.uid() or public.is_admin())
    )
  );

-- produtos_config: leitura pública para usuários autenticados, escrita só admin
drop policy if exists produtos_config_select on public.produtos_config;
create policy produtos_config_select on public.produtos_config
  for select using (auth.role() = 'authenticated');

drop policy if exists produtos_config_upsert on public.produtos_config;
create policy produtos_config_upsert on public.produtos_config
  for insert with check (public.is_admin());

drop policy if exists produtos_config_update on public.produtos_config;
create policy produtos_config_update on public.produtos_config
  for update using (public.is_admin()) with check (public.is_admin());

-- ─────────────────────────────────────────────────────────────
-- storage: bucket para os Excel de pedidos
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('pedidos-excel', 'pedidos-excel', false)
on conflict (id) do nothing;

drop policy if exists pedidos_excel_read on storage.objects;
create policy pedidos_excel_read on storage.objects
  for select using (
    bucket_id = 'pedidos-excel'
    and (owner = auth.uid() or public.is_admin())
  );

drop policy if exists pedidos_excel_insert on storage.objects;
create policy pedidos_excel_insert on storage.objects
  for insert with check (
    bucket_id = 'pedidos-excel' and auth.role() = 'authenticated'
  );
