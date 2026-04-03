CREATE TABLE public.buscas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id uuid NOT NULL,
  texto_original text NOT NULL,
  query_pubmed text,
  query_cochrane text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.buscas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own searches"
ON public.buscas FOR SELECT
USING (auth.uid() = usuario_id);

CREATE POLICY "Users can insert their own searches"
ON public.buscas FOR INSERT
WITH CHECK (auth.uid() = usuario_id);

CREATE POLICY "Users can delete their own searches"
ON public.buscas FOR DELETE
USING (auth.uid() = usuario_id);

CREATE INDEX idx_buscas_usuario_id ON public.buscas(usuario_id);
CREATE INDEX idx_buscas_created_at ON public.buscas(created_at DESC);