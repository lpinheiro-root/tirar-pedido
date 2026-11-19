-- Natuhair — aba FIDC (operações de antecipação de recebíveis)
-- Rodar no SQL editor do Supabase.
-- Alimentada pelo financeiro importando a planilha "operações - atual.xlsx"
-- (uma aba por dia). Cada importação substitui os dias que vierem na planilha.

-- permissão da aba, marcada na tela de Usuários
alter table public.representantes
  add column if not exists acesso_fidc boolean not null default false;

-- uma linha por FIDC + empresa em cada dia de operação
create table if not exists public.fidc_operacoes (
  id bigint generated always as identity primary key,
  data date not null,
  aba text not null,              -- nome da aba na planilha
  ordem int not null,             -- linha dentro da aba
  nome_original text not null,    -- como estava escrito ("CRESCER - RJ")
  fidc text not null,             -- nome padrão ("Crescer")
  empresa text not null,          -- nome padrão ("Veneza RJ")
  valor_operacao numeric(14,2) not null default 0,
  bruto numeric(14,2) not null default 0,
  recompras numeric(14,2) not null default 0,
  refaturamento numeric(14,2) not null default 0,
  nota_troca numeric(14,2) not null default 0,
  substituicao numeric(14,2) not null default 0,
  prorrogacao numeric(14,2) not null default 0,
  desconto numeric(14,2) not null default 0,
  despesas numeric(14,2) not null default 0,
  liquido numeric(14,2) not null default 0,
  importacao_id bigint,
  unique (data, aba, ordem)
);
create index if not exists fidc_operacoes_data_idx on public.fidc_operacoes (data desc);
create index if not exists fidc_operacoes_fidc_idx on public.fidc_operacoes (fidc, data desc);

-- bloco FATURAMENTO de cada dia: de que dias de faturamento vieram os títulos
create table if not exists public.fidc_faturamentos (
  id bigint generated always as identity primary key,
  data_operacao date not null,
  aba text not null,
  ordem int not null,
  data_faturamento date,
  valor numeric(14,2) not null default 0,
  importacao_id bigint,
  unique (data_operacao, aba, ordem)
);
create index if not exists fidc_faturamentos_data_idx on public.fidc_faturamentos (data_operacao desc);

-- histórico de importações (quem subiu, quando, o que entrou)
create table if not exists public.fidc_importacoes (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  usuario_id uuid references auth.users(id),
  usuario_nome text,
  arquivo text,
  dias int not null default 0,
  operacoes int not null default 0,
  primeira_data date,
  ultima_data date,
  avisos jsonb not null default '[]'::jsonb
);

-- só o servidor (service role) lê e grava; a tela confere a permissão antes
alter table public.fidc_operacoes enable row level security;
alter table public.fidc_faturamentos enable row level security;
alter table public.fidc_importacoes enable row level security;
grant select, insert, update, delete on public.fidc_operacoes, public.fidc_faturamentos, public.fidc_importacoes to service_role;
grant usage, select on all sequences in schema public to service_role;
