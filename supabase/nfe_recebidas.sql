-- Natuhair Finanças — NF-e Recebidas
-- Rodar no SQL editor do Supabase.

-- empresa (CNPJ) destinatária de cada nota, para filtrar por Biosense/Veneza/Roma
alter table public.cartao_notas add column if not exists cnpj_destinatario text;

-- preenche as notas que já estão no sistema a partir do XML
update public.cartao_notas
set cnpj_destinatario = substring(xml from '<dest>[^<]*<CNPJ>([0-9]{14})</CNPJ>')
where cnpj_destinatario is null and xml is not null;

create index if not exists cartao_notas_destinatario_idx on public.cartao_notas (cnpj_destinatario, data_emissao desc);
