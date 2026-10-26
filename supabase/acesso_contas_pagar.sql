-- Natuhair Finanças: permissão da aba Contas a Pagar, marcada na tela de Usuários.
alter table public.representantes
  add column if not exists acesso_contas_pagar boolean not null default false;
