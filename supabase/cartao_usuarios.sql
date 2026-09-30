-- Natuhair Cartão — dados por usuário
-- Rodar no SQL editor do Supabase depois de cartao.sql.
--
-- Cada usuário vê só as próprias faturas, compras e contas conectadas.
-- O super admin (ti@natuhair.ind.br) vê tudo e é o único que gerencia usuários.

-- ─────────────────────────────────────────────────────────────
-- super admin
-- ─────────────────────────────────────────────────────────────
alter table public.representantes
  add column if not exists super_admin boolean not null default false;

update public.representantes set super_admin = true where email = 'ti@natuhair.ind.br';

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.representantes
    where id = auth.uid() and role = 'admin' and super_admin and ativo
  );
$$;

-- só o super admin cria/altera usuários (impede um admin comum de se promover)
drop policy if exists representantes_update on public.representantes;
create policy representantes_update on public.representantes
  for update using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists representantes_insert on public.representantes;
create policy representantes_insert on public.representantes
  for insert with check (public.is_super_admin());

-- ─────────────────────────────────────────────────────────────
-- dono de cada registro
-- ─────────────────────────────────────────────────────────────
alter table public.cartao_compras
  add column if not exists usuario_id uuid references auth.users (id) on delete cascade default auth.uid();
alter table public.cartao_integracoes
  add column if not exists usuario_id uuid references auth.users (id) on delete cascade;
alter table public.cartao_faturas
  alter column criado_por set default auth.uid();

-- registros antigos ficam com o super admin
update public.cartao_compras
  set usuario_id = (select id from public.representantes where email = 'ti@natuhair.ind.br')
  where usuario_id is null;
update public.cartao_integracoes
  set usuario_id = (select id from public.representantes where email = 'ti@natuhair.ind.br')
  where usuario_id is null;
update public.cartao_faturas
  set criado_por = (select id from public.representantes where email = 'ti@natuhair.ind.br')
  where criado_por is null;

alter table public.cartao_compras alter column usuario_id set not null;
alter table public.cartao_integracoes alter column usuario_id set not null;

-- unicidade passa a ser por usuário
alter table public.cartao_compras drop constraint if exists cartao_compras_origem_pedido_externo_key;
alter table public.cartao_compras drop constraint if exists cartao_compras_usuario_pedido_key;
alter table public.cartao_compras
  add constraint cartao_compras_usuario_pedido_key unique (usuario_id, origem, pedido_externo);

alter table public.cartao_faturas drop constraint if exists cartao_faturas_arquivo_hash_key;
alter table public.cartao_faturas drop constraint if exists cartao_faturas_usuario_hash_key;
alter table public.cartao_faturas
  add constraint cartao_faturas_usuario_hash_key unique (criado_por, arquivo_hash);

alter table public.cartao_integracoes
  drop constraint if exists cartao_integracoes_provedor_usuario_externo_id_key;
alter table public.cartao_integracoes drop constraint if exists cartao_integracoes_dono_key;
alter table public.cartao_integracoes
  add constraint cartao_integracoes_dono_key unique (usuario_id, provedor, usuario_externo_id);

create index if not exists cartao_compras_usuario_idx on public.cartao_compras (usuario_id, data desc);
create index if not exists cartao_faturas_criado_por_idx on public.cartao_faturas (criado_por);

-- ─────────────────────────────────────────────────────────────
-- RLS: cada um vê o seu, super admin vê tudo
-- ─────────────────────────────────────────────────────────────
drop policy if exists cartao_compras_admin on public.cartao_compras;
create policy cartao_compras_admin on public.cartao_compras
  for all
  using (public.is_admin() and (usuario_id = auth.uid() or public.is_super_admin()))
  with check (public.is_admin() and (usuario_id = auth.uid() or public.is_super_admin()));

drop policy if exists cartao_faturas_admin on public.cartao_faturas;
create policy cartao_faturas_admin on public.cartao_faturas
  for all
  using (public.is_admin() and (criado_por = auth.uid() or public.is_super_admin()))
  with check (public.is_admin() and (criado_por = auth.uid() or public.is_super_admin()));

drop policy if exists cartao_lancamentos_admin on public.cartao_lancamentos;
create policy cartao_lancamentos_admin on public.cartao_lancamentos
  for all
  using (
    public.is_admin() and exists (
      select 1 from public.cartao_faturas f
      where f.id = cartao_lancamentos.fatura_id
        and (f.criado_por = auth.uid() or public.is_super_admin())
    )
  )
  with check (
    public.is_admin() and exists (
      select 1 from public.cartao_faturas f
      where f.id = cartao_lancamentos.fatura_id
        and (f.criado_por = auth.uid() or public.is_super_admin())
    )
  );
