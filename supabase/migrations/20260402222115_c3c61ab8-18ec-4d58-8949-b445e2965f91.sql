
-- Create artigos table
CREATE TABLE public.artigos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  journal TEXT,
  ano INTEGER,
  especialidade TEXT DEFAULT 'Cardiologia',
  resumo_pt TEXT,
  tipo_estudo TEXT,
  grade TEXT,
  grade_justificativa TEXT,
  rob_resultado TEXT,
  analise_metodologica TEXT,
  contexto_vs_anterior TEXT,
  questao TEXT,
  alt_a TEXT, alt_b TEXT, alt_c TEXT, alt_d TEXT,
  resposta_correta TEXT,
  feedback_quiz TEXT,
  pmid TEXT UNIQUE,
  link_original TEXT,
  citacoes INTEGER DEFAULT 0,
  score_relevancia NUMERIC DEFAULT 0,
  data_publicacao DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.artigos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Artigos are publicly readable" ON public.artigos FOR SELECT USING (true);

-- Create usuarios table
CREATE TABLE public.usuarios (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  nome TEXT,
  especialidade TEXT DEFAULT 'Cardiologia',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own data" ON public.usuarios FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert their own data" ON public.usuarios FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update their own data" ON public.usuarios FOR UPDATE USING (auth.uid() = id);

-- Create progresso table
CREATE TABLE public.progresso (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  artigo_id UUID NOT NULL REFERENCES public.artigos(id) ON DELETE CASCADE,
  respondeu BOOLEAN DEFAULT false,
  acertou BOOLEAN,
  data_resposta TIMESTAMPTZ,
  proxima_revisao DATE,
  vezes_revisado INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.progresso ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own progress" ON public.progresso FOR SELECT USING (auth.uid() = usuario_id);
CREATE POLICY "Users can insert their own progress" ON public.progresso FOR INSERT WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users can update their own progress" ON public.progresso FOR UPDATE USING (auth.uid() = usuario_id);
