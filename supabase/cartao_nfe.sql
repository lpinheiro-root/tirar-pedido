-- Natuhair Cartão — notas fiscais (NF-e) baixadas da SEFAZ
-- Rodar no SQL editor do Supabase depois de cartao_usuarios.sql.

-- números dos pedidos de cada compra (Mercado Livre: um pagamento pode cobrir
-- vários pedidos), usados para casar a nota fiscal com a compra
alter table public.cartao_compras add column if not exists pedidos text[];

-- ─────────────────────────────────────────────────────────────
-- configuração (linha única). Guarda a senha do certificado: sem policies e
-- sem GRANT para authenticated — só o servidor (service role) lê.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.cartao_nfe_config (
  id integer primary key default 1 check (id = 1),
  cnpj text,
  uf text,
  cert_titular text,
  cert_validade timestamptz,
  cert_senha text,
  ult_nsu text not null default '000000000000000',
  max_nsu text,
  proxima_consulta timestamptz,
  ultima_consulta timestamptz,
  ultimo_status text,
  atualizado_em timestamptz not null default now()
);

alter table public.cartao_nfe_config enable row level security;
revoke all on public.cartao_nfe_config from anon, authenticated;
grant select, insert, update, delete on public.cartao_nfe_config to service_role;

-- ─────────────────────────────────────────────────────────────
-- notas
-- ─────────────────────────────────────────────────────────────
create table if not exists public.cartao_notas (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,
  nsu text,
  cnpj_emitente text,
  nome_emitente text,
  data_emissao timestamptz,
  valor_total numeric(12, 2),
  situacao text not null default 'resumo' check (situacao in ('resumo', 'completa', 'cancelada')),
  ciencia_em timestamptz,
  ciencia_status text,
  xml text,
  pedidos_ref text[],
  compra_id uuid references public.cartao_compras (id) on delete set null,
  vinculo text check (vinculo in ('auto', 'manual')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists cartao_notas_compra_idx on public.cartao_notas (compra_id);
create index if not exists cartao_notas_emissao_idx on public.cartao_notas (data_emissao desc);

alter table public.cartao_notas enable row level security;
grant select on public.cartao_notas to authenticated;
grant select, insert, update, delete on public.cartao_notas to service_role;

-- quem fez a compra vê a nota casada com ela; o super admin vê todas
drop policy if exists cartao_notas_select on public.cartao_notas;
create policy cartao_notas_select on public.cartao_notas
  for select using (
    public.is_super_admin()
    or exists (
      select 1 from public.cartao_compras c
      where c.id = cartao_notas.compra_id and c.usuario_id = auth.uid() and public.is_admin()
    )
  );

-- ─────────────────────────────────────────────────────────────
-- storage: certificado A1 (privado, sem policies — só service role)
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('cartao-certificados', 'cartao-certificados', false)
on conflict (id) do nothing;
