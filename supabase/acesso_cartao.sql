-- Natuhair Finanças: permissão de acesso ao Cartão, marcada na tela de Usuários
-- (junto com a de NF-e Recebidas, que é a coluna acesso_devolucoes).
-- Quem já existe continua com o Cartão liberado (default true).
alter table public.representantes
  add column if not exists acesso_cartao boolean not null default true;
