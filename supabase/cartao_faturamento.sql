-- Natuhair Finanças — em qual documento a compra foi faturada
-- Rodar no SQL editor do Supabase.
--
-- 'cpf'  → compra no CPF: não terá nota fiscal para a empresa (o número do CPF não é guardado)
-- 'cnpj' → compra no CNPJ informado em faturamento_cnpj (Biosense, Veneza, Roma...)
alter table public.cartao_compras
  add column if not exists faturamento text check (faturamento in ('cpf', 'cnpj')),
  add column if not exists faturamento_cnpj text;
