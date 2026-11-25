-- Foto do usuário (aparece no topo do sistema, ao lado do nome e e-mail).
-- Guardada como imagem pequena (JPEG 160x160 em data URL, ~10 KB), enviada pelo próprio usuário.
alter table public.representantes add column if not exists foto text;
