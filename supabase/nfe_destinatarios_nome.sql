-- Natuhair Finanças — nome padronizado de cada empresa no filtro de NF-e Recebidas
-- Rodar no SQL editor do Supabase.
--
-- Cada fornecedor escreve o nome do destinatário de um jeito; o filtro passa a
-- mostrar o nome mais frequente de cada CNPJ.
create or replace view public.nfe_destinatarios
with (security_invoker = true) as
select
  cnpj_destinatario as cnpj,
  mode() within group (order by upper(trim(nome_destinatario))) as nome,
  count(*) as notas
from public.cartao_notas
where cnpj_destinatario is not null
group by cnpj_destinatario;

grant select on public.nfe_destinatarios to authenticated, service_role;
