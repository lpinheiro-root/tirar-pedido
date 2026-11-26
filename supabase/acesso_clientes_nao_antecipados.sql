-- Clientes não antecipados: acesso por usuário (tela Usuários).
alter table public.representantes
  add column if not exists acesso_clientes_nao_antecipados boolean not null default false;
