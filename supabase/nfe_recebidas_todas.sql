-- Natuhair Finanças — NF-e Recebidas de todas as empresas do NF-Stock
-- Rodar no SQL editor do Supabase depois de nfe_recebidas.sql.

-- XML comprimido (gzip em base64) para caber no plano grátis; nome da empresa destinatária
alter table public.cartao_notas
  add column if not exists xml_gz text,
  add column if not exists nome_destinatario text;

-- nome das empresas para as notas que já estão no sistema
update public.cartao_notas
set nome_destinatario = substring(xml from '<dest>.*?<xNome>([^<]*)</xNome>')
where nome_destinatario is null and xml is not null;

-- empresas que já receberam notas (para o filtro da tela); respeita o RLS de cartao_notas
create or replace view public.nfe_destinatarios
with (security_invoker = true) as
select cnpj_destinatario as cnpj, max(nome_destinatario) as nome, count(*) as notas
from public.cartao_notas
where cnpj_destinatario is not null
group by cnpj_destinatario;

grant select on public.nfe_destinatarios to authenticated;
