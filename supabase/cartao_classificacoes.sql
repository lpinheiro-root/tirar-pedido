-- Natuhair Finanças: memória da planilha "Cartões" do financeiro.
-- Cada linha já descrita pela equipe (estabelecimento, descrição, conta contábil)
-- serve para preencher o Excel exportado das próximas faturas.
-- Só o servidor (service role) lê e grava; a importação exige acesso ao Cartão.
create table if not exists public.cartao_classificacoes (
  id bigserial primary key,
  empresa text not null,
  vencimento date,
  valor numeric(14, 2) not null,
  parcela_atual integer,
  parcela_total integer,
  estabelecimento text,
  descricao text,
  conta_contabil text,
  importado_por uuid references auth.users (id) on delete set null,
  importado_em timestamptz not null default now()
);

create index if not exists cartao_classificacoes_empresa_idx on public.cartao_classificacoes (empresa, parcela_total);

alter table public.cartao_classificacoes enable row level security;
grant select, insert, update, delete on public.cartao_classificacoes to service_role;
grant usage, select on sequence public.cartao_classificacoes_id_seq to service_role;
