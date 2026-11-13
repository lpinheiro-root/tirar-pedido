-- Natuhair Finanças — NF-e Recebidas: aba Fornecedores
-- Rodar no SQL editor do Supabase.
-- Quem tem acesso às devoluções passa a ver também as notas de compra (fornecedores).
-- O super admin já vê todas pela policy cartao_notas_select.

drop policy if exists cartao_notas_fornecedores on public.cartao_notas;
create policy cartao_notas_fornecedores on public.cartao_notas
  for select using (tipo = 'compra' and public.pode_ver_devolucoes());
