-- Acesso à tela Carteira FIDC (borderô × carteira no ORGM), liberado por usuário na tela de Usuários.
alter table public.representantes
  add column if not exists acesso_fidc_carteira boolean not null default false;
