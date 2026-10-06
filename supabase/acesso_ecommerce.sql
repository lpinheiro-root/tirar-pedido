-- Natuhair Finanças: permissão da aba E-Commerce, marcada na tela de Usuários.
alter table public.representantes
  add column if not exists acesso_ecommerce boolean not null default false;
