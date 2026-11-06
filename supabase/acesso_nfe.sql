-- Natuhair Finanças: permissão da aba NFE (emitidas, entradas e consulta por chave), marcada na tela de Usuários.
alter table public.representantes
  add column if not exists acesso_nfe boolean not null default false;
