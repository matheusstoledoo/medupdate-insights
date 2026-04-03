ALTER TABLE public.artigos ADD COLUMN IF NOT EXISTS tem_texto_completo boolean DEFAULT false;
ALTER TABLE public.artigos ADD COLUMN IF NOT EXISTS url_texto_completo text;
ALTER TABLE public.artigos ADD COLUMN IF NOT EXISTS vieses_detalhados text;
ALTER TABLE public.artigos ADD COLUMN IF NOT EXISTS limitacoes_autores text;
ALTER TABLE public.artigos ADD COLUMN IF NOT EXISTS conflitos_interesse text;