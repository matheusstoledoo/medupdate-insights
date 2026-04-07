ALTER TABLE artigos
  ADD COLUMN IF NOT EXISTS introducao_resumo text,
  ADD COLUMN IF NOT EXISTS metodologia_detalhada text,
  ADD COLUMN IF NOT EXISTS resultados_principais text,
  ADD COLUMN IF NOT EXISTS conclusao_autores text,
  ADD COLUMN IF NOT EXISTS implicacao_clinica text;