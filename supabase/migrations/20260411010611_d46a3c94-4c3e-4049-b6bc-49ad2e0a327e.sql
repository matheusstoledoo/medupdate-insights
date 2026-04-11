
CREATE TABLE public.controle_processamento (
  chave TEXT PRIMARY KEY,
  valor TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.controle_processamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access" ON public.controle_processamento
  FOR SELECT USING (true);
