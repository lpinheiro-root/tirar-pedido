-- Acesso à tela Mensal FIDC (risco do mês), liberado por usuário na tela de Usuários.
alter table public.representantes
  add column if not exists acesso_fidc_mensal boolean not null default false;
