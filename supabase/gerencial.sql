-- Relatório Gerencial (DG): o que o controle digita no sistema. As despesas vêm do ORGM (pagamentos por conta contábil).
-- Faturamento, recebimento e cheque especial do mês (o faturamento é a base do "% s/ faturamento").
create table if not exists public.gerencial_mensal (
  ano int not null,
  mes int not null check (mes between 1 and 12),
  faturamento numeric(16,2) not null default 0,
  fat_off numeric(16,2) not null default 0,
  fat_terceiros numeric(16,2) not null default 0,
  fat_ecommerce numeric(16,2) not null default 0,
  fat_exportacao numeric(16,2) not null default 0,
  recebimento numeric(16,2) not null default 0,
  cheque_especial numeric(16,2) not null default 0,
  atualizado_por text,
  atualizado_em timestamptz not null default now(),
  primary key (ano, mes)
);

-- Acertos feitos à mão: tira valor de uma rubrica (de_rubrica) e/ou põe em outra (para_rubrica), num mês.
create table if not exists public.gerencial_ajustes (
  id bigserial primary key,
  ano int not null,
  mes int not null check (mes between 1 and 12),
  de_rubrica text,
  para_rubrica text,
  valor numeric(16,2) not null,
  descricao text not null default '',
  criado_por text,
  criado_em timestamptz not null default now(),
  check (de_rubrica is not null or para_rubrica is not null)
);
create index if not exists gerencial_ajustes_ano on public.gerencial_ajustes (ano, mes);

-- Rubrica escolhida pelo controle para uma conta contábil (vale por cima do de-para padrão do sistema).
create table if not exists public.gerencial_depara (
  conta text primary key,
  rubrica text not null,
  alterado_por text,
  alterado_em timestamptz not null default now()
);

-- Parâmetro (% sobre o faturamento) de cada rubrica, quando o controle muda o padrão.
create table if not exists public.gerencial_parametros (
  rubrica text primary key,
  percentual numeric(8,5) not null,
  alterado_por text,
  alterado_em timestamptz not null default now()
);

alter table public.gerencial_mensal enable row level security;
alter table public.gerencial_ajustes enable row level security;
alter table public.gerencial_depara enable row level security;
alter table public.gerencial_parametros enable row level security;
grant select, insert, update, delete on public.gerencial_mensal, public.gerencial_ajustes, public.gerencial_depara, public.gerencial_parametros to service_role;
grant usage, select on sequence public.gerencial_ajustes_id_seq to service_role;

-- Valores já digitados na planilha "DG - Relatorio gerencial financeiro - 2026" (2025 e 2026).
insert into public.gerencial_mensal (ano, mes, faturamento, fat_off, fat_terceiros, fat_ecommerce, fat_exportacao, recebimento, cheque_especial)
values
  (2025, 1, 4739074.56, 3653236, 151728, 580533, 353577, 4466351, 119845),
  (2025, 2, 4165565, 3488109, 127650, 549435, 371, 4166056, 7669.86),
  (2025, 3, 4628823, 3788971, 196659, 643193, 0, 4596194, 84493),
  (2025, 4, 4915322, 3740500, 467384, 707438, 0, 4641008, -41898),
  (2025, 5, 5733308, 4560636, 363113, 703649, 105910, 4872865, 1975.71),
  (2025, 6, 5906545.6, 4464027, 661195, 694978, 86345, 5500950, 112219),
  (2025, 7, 5323592, 4104552, 506129, 712911, 0, 5430485, 54834),
  (2025, 8, 6544257, 4872401, 856466, 815390, 0, 5767368, 177707),
  (2025, 9, 5997094, 4766372, 435361, 795361, 0, 6276048, 64087),
  (2025, 10, 7138645.2, 5301619, 1066840, 770186.2, 0, 6426387, 14072),
  (2025, 11, 6231129, 4476596, 768499, 986034, 0, 6460364, 368616),
  (2025, 12, 6793237, 5469856, 502116, 821265, 0, 7404559, 56165),
  (2026, 1, 5429872, 4037454, 981734, 922916, 410684, 6132566, 0),
  (2026, 2, 5565545, 4121104, 990061, 1093943, 454380, 5572906, 0),
  (2026, 3, 5429872, 3960164, 1126981, 1200095, 0, 6319364, 0),
  (2026, 4, 5722035, 4670505, 1051530, 1074308, 0, 6230311, 0),
  (2026, 5, 6105317, 5015011, 1026540, 1053348, 63766, 6324398, 0),
  (2026, 6, 6283651, 5160786, 1061389, 1197869, 61476, 6468598, 0),
  (2026, 10, 7001668, 5880870, 938740, 908720, 182058, 7500862, 0)
on conflict (ano, mes) do nothing;
