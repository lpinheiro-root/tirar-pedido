-- FIDC: borderôs (PDF "Borderô Comprimido Analítico" do Meus Recebíveis) importados pela cobrança.
-- Cada borderô vira (ou se liga a) uma linha de fidc_operacoes e guarda os títulos antecipados.

-- CNPJ do cedente → empresa do grupo (aprende quando alguém escolhe a empresa na importação)
create table if not exists public.fidc_cedentes (
  cnpj text primary key,
  empresa text not null,
  nome text,
  criado_em timestamptz not null default now()
);
insert into public.fidc_cedentes (cnpj, empresa, nome)
values ('29.323.477/0001-90', 'Roma', 'ROMA DISTRIBUIDORA DE PRODUTOS DE BELEZA LTDA')
on conflict (cnpj) do nothing;

create table if not exists public.fidc_borderos (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  usuario_id uuid references auth.users(id),
  usuario_nome text,
  arquivo text,
  fidc text not null,                 -- nome padrão ("Lecca")
  fidc_nome text not null,            -- como vem no PDF ("RIVO FUNDO INVESTIMENTO ...")
  empresa text not null,              -- nome padrão ("Roma")
  cedente_nome text,
  cedente_cnpj text not null default '',
  tipo text,                          -- Factoring / AQUISIÇÃO / ANTECIPAÇÃO
  numero text not null,               -- nº do borderô
  data date not null,                 -- data da operação
  qtd_titulos int not null default 0,
  bruto numeric(14,2) not null default 0,               -- valor total dos títulos
  desagio numeric(14,2) not null default 0,             -- deságio / fator
  taxa_servico numeric(14,2) not null default 0,
  iss numeric(14,2) not null default 0,
  iof numeric(14,2) not null default 0,
  despesas_bancarias numeric(14,2) not null default 0,
  despesas numeric(14,2) not null default 0,            -- custo total (= coluna Despesas da planilha)
  liquido_operacao numeric(14,2) not null default 0,
  recompra numeric(14,2) not null default 0,
  desconto numeric(14,2) not null default 0,            -- desconto concedido pelo cedente ao sacado
  liquido numeric(14,2) not null default 0,             -- pago ao cedente (= VALOR/liquido da planilha)
  unique (fidc, cedente_cnpj, numero)
);
create index if not exists fidc_borderos_data_idx on public.fidc_borderos (data desc);

create table if not exists public.fidc_bordero_titulos (
  id bigint generated always as identity primary key,
  bordero_id bigint not null references public.fidc_borderos(id) on delete cascade,
  ordem int not null,
  numero text not null,
  vencimento date,
  sacado text,
  valor numeric(14,2) not null default 0,
  desagio numeric(14,2) not null default 0,
  desagiado numeric(14,2) not null default 0
);
create index if not exists fidc_bordero_titulos_bordero_idx on public.fidc_bordero_titulos (bordero_id, ordem);

-- operação: de onde veio e a qual borderô está ligada
alter table public.fidc_operacoes add column if not exists origem text not null default 'planilha';
alter table public.fidc_operacoes add column if not exists bordero_id bigint references public.fidc_borderos(id) on delete set null;
create index if not exists fidc_operacoes_bordero_idx on public.fidc_operacoes (bordero_id);

alter table public.fidc_cedentes enable row level security;
alter table public.fidc_borderos enable row level security;
alter table public.fidc_bordero_titulos enable row level security;
grant select, insert, update, delete on public.fidc_cedentes, public.fidc_borderos, public.fidc_bordero_titulos to service_role;
grant usage, select on all sequences in schema public to service_role;
