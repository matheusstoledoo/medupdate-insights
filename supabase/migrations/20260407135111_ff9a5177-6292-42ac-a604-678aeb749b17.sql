ALTER TABLE artigos
  ADD COLUMN IF NOT EXISTS jadad_score text,
  ADD COLUMN IF NOT EXISTS jadad_justificativa text,
  ADD COLUMN IF NOT EXISTS amstar2_classificacao text,
  ADD COLUMN IF NOT EXISTS amstar2_justificativa text,
  ADD COLUMN IF NOT EXISTS robis_resultado text,
  ADD COLUMN IF NOT EXISTS robis_justificativa text,
  ADD COLUMN IF NOT EXISTS casp_resumo text,
  ADD COLUMN IF NOT EXISTS ferramentas_usadas text;