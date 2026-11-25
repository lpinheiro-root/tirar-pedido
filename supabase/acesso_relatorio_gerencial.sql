-- Relatório Gerencial: acesso por usuário (tela Usuários).
alter table public.representantes
  add column if not exists acesso_relatorio_gerencial boolean not null default false;
