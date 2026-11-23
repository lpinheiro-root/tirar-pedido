-- Taxa do deságio que vem no borderô ("Deságio..... 2,10 (%)"), mostrada ao lado do custo no painel FIDC.
alter table public.fidc_borderos add column if not exists desagio_pct numeric(8,4);
-- borderôs já importados (Amplic 269, Crescer 473, Lecca 176): 2,10%
update public.fidc_borderos set desagio_pct = 2.10 where desagio_pct is null and (fidc, numero) in (('Amplic','269'),('Crescer','473'),('Lecca','176'));
