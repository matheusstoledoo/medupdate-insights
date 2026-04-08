import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function buildPrompt(textoParaAnalise: string): string {
  return `Você é um cardiologista especialista em medicina baseada em evidências. Você recebeu o texto completo (fonte: upload manual) de um artigo científico e deve gerar uma análise estruturada, robusta e clinicamente útil, suficiente para que um médico possa entender e interpretar o estudo sem precisar ler o original.

## Regras obrigatórias:
- Nunca diga que dados estão ausentes se eles estiverem presentes no texto fornecido
- Sempre inclua valores numéricos exatos (n, %, HR, OR, RR, IC 95%, p-valor) quando disponíveis no texto
- A análise deve permitir que um leitor replique mentalmente o estudo e julgue sua validade
- Linguagem técnica em português, acessível a médicos

## Identificação do tipo de estudo:
Identifique o tipo exato:
- Ensaio Clínico Randomizado (RCT)
- Revisão Sistemática ou Meta-análise
- Estudo de Coorte
- Estudo Caso-Controle
- Estudo Transversal
- Guideline / Consenso
- Outro (especificar)

## Ferramentas de avaliação por tipo:
SE for RCT: aplique RoB 2 (5 domínios), Jadad Scale (0-5), CASP RCT
SE for Revisão Sistemática/Meta-análise: aplique AMSTAR 2, ROBIS, CASP SR, GRADE
SE for Coorte: aplique CASP Cohort, Newcastle-Ottawa Scale
SE for Caso-Controle: aplique CASP Case-Control, Newcastle-Ottawa adaptada
SE for Guideline/Consenso: aplique AGREE II resumido

## Retorne SOMENTE este JSON válido, sem texto antes ou depois:
{
  "metodologia": {
    "delineamento": "Tipo exato do estudo",
    "populacao": {
      "descricao": "Descrição detalhada",
      "n_total": "número total",
      "caracteristicas_basais": "Idade, % mulheres, comorbidades — com números",
      "criterios_inclusao": "Principais critérios com detalhes numéricos",
      "criterios_exclusao": "Principais critérios de exclusão"
    },
    "intervencao": "Droga/procedimento, dose exata, via, duração",
    "comparador": "Placebo ou comparador ativo com detalhes",
    "desfecho_primario": "Definição exata do desfecho primário",
    "desfechos_secundarios": "Lista dos principais desfechos secundários",
    "seguimento": "Duração e visitas de seguimento",
    "randomizacao": "Método, estratificação, razão de alocação",
    "analise_estatistica": "Teste primário, modelo, potência, alfa"
  },
  "resultados": {
    "desfecho_primario": {
      "grupo_intervencao": "n (%) que atingiram o desfecho",
      "grupo_controle": "n (%) que atingiram o desfecho",
      "estimativa": "HR/OR/RR com IC 95% e p-valor",
      "interpretacao": "O que esse resultado significa clinicamente"
    },
    "desfechos_secundarios": [
      { "nome": "Nome", "resultado": "n (%), HR/OR/RR, IC 95%, p-valor", "interpretacao": "breve interpretação" }
    ],
    "seguranca": {
      "eventos_adversos_principais": "Incidências comparativas nos dois grupos",
      "descontinuacoes": "Taxa de descontinuação por eventos adversos"
    },
    "analises_pre_especificadas": "Subgrupos com resultados numéricos"
  },
  "conclusao": {
    "conclusao_dos_autores": "O que os autores concluíram exatamente",
    "implicacao_clinica": "O que muda na prática clínica",
    "limitacoes": "Limitações metodológicas mencionadas",
    "contexto_evidencia": "Como se encaixa na evidência existente"
  },
  "titulo": "título completo em português",
  "journal": "nome do periódico se identificável",
  "ano": 2024,
  "tipo_estudo": "tipo exato",
  "ferramentas_usadas": "ferramentas aplicadas separadas por vírgula",
  "resumo_pt": "3-4 frases sintetizando o artigo",
  "grade": "Alto, Moderado, Baixo ou Muito baixo",
  "grade_justificativa": "justificativa GRADE",
  "rob_resultado": "Baixo risco, Algumas preocupações ou Alto risco",
  "vieses_detalhados": "D1-D5 ou adaptado por tipo",
  "jadad_score": null,
  "jadad_justificativa": "pontuação detalhada se RCT",
  "amstar2_classificacao": null,
  "amstar2_justificativa": "se revisão sistemática",
  "robis_resultado": null,
  "robis_justificativa": "se revisão sistemática",
  "analise_metodologica": "avaliação crítica independente em 3-4 frases",
  "limitacoes_autores": "limitações declaradas pelos autores",
  "conflitos_interesse": "conflitos e financiamento",
  "contexto_vs_anterior": "como muda a evidência prévia",
  "casp_resumo": "avaliação CASP resumida",
  "introducao_resumo": "contexto e justificativa em 2-3 frases",
  "metodologia_detalhada": "desenho, população, intervenção, desfechos, seguimento — texto corrido",
  "resultados_principais": "desfecho primário com números, IC 95%, p-valor. Secundários. Adversos. NNT/NNH.",
  "conclusao_autores": "conclusão declarada",
  "implicacao_clinica": "impacto na prática em 1-2 frases",
  "questao": "caso clínico de 2-3 frases",
  "alt_a": "", "alt_b": "", "alt_c": "", "alt_d": "",
  "resposta_correta": "A, B, C ou D",
  "feedback_quiz": "explicação com referência aos resultados"
}

Texto do artigo (${textoParaAnalise.length} chars):
${textoParaAnalise}`;
}

function buildInsertPayload(parsed: Record<string, any>) {
  const analiseCompleta: Record<string, any> = {};
  if (parsed.metodologia) analiseCompleta.metodologia = parsed.metodologia;
  if (parsed.resultados) analiseCompleta.resultados = parsed.resultados;
  if (parsed.conclusao) analiseCompleta.conclusao = parsed.conclusao;

  return {
    titulo: parsed.titulo || "Artigo enviado por upload",
    journal: parsed.journal || null,
    ano: parsed.ano ?? new Date().getFullYear(),
    especialidade: "Cardiologia",
    resumo_pt: parsed.resumo_pt || null,
    introducao_resumo: parsed.introducao_resumo || null,
    metodologia_detalhada: parsed.metodologia_detalhada || null,
    resultados_principais: parsed.resultados_principais || null,
    conclusao_autores: parsed.conclusao_autores || parsed.conclusao?.conclusao_dos_autores || null,
    implicacao_clinica: parsed.implicacao_clinica || parsed.conclusao?.implicacao_clinica || null,
    tipo_estudo: parsed.tipo_estudo || parsed.metodologia?.delineamento || null,
    ferramentas_usadas: parsed.ferramentas_usadas || null,
    grade: parsed.grade || null,
    grade_justificativa: parsed.grade_justificativa || null,
    rob_resultado: parsed.rob_resultado || null,
    analise_metodologica: parsed.analise_metodologica || null,
    contexto_vs_anterior: parsed.contexto_vs_anterior || parsed.conclusao?.contexto_evidencia || null,
    vieses_detalhados: parsed.vieses_detalhados || null,
    jadad_score: parsed.jadad_score || null,
    jadad_justificativa: parsed.jadad_justificativa || null,
    amstar2_classificacao: parsed.amstar2_classificacao || null,
    amstar2_justificativa: parsed.amstar2_justificativa || null,
    robis_resultado: parsed.robis_resultado || null,
    robis_justificativa: parsed.robis_justificativa || null,
    casp_resumo: parsed.casp_resumo || null,
    limitacoes_autores: parsed.limitacoes_autores || parsed.conclusao?.limitacoes || null,
    conflitos_interesse: parsed.conflitos_interesse || null,
    questao: parsed.questao || null,
    alt_a: parsed.alt_a || null,
    alt_b: parsed.alt_b || null,
    alt_c: parsed.alt_c || null,
    alt_d: parsed.alt_d || null,
    resposta_correta: parsed.resposta_correta || null,
    feedback_quiz: parsed.feedback_quiz || null,
    analise_completa: Object.keys(analiseCompleta).length > 0 ? analiseCompleta : null,
    tem_texto_completo: true,
    fonte_texto: "upload",
    citacoes: 0,
    score_relevancia: 50,
    data_publicacao: new Date().toISOString().split("T")[0],
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { texto, fonte } = await req.json();

    if (!texto || typeof texto !== "string" || texto.trim().length < 100) {
      return new Response(JSON.stringify({ error: "Texto muito curto para análise (mínimo 100 caracteres)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY não configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const textoLimitado = texto.trim().substring(0, 15000);
    const promptAnalise = buildPrompt(textoLimitado);

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 5000,
        messages: [{ role: "user", content: promptAnalise }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      console.error("Claude API error:", claudeRes.status, errText);
      return new Response(JSON.stringify({ error: "Erro ao analisar artigo com IA" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const claudeData = await claudeRes.json();
    const rawContent = claudeData?.content?.[0]?.text ?? "";

    let parsed: Record<string, any>;
    try {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found");
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return new Response(JSON.stringify({ error: "Resposta da IA inválida" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const insertPayload = buildInsertPayload(parsed);

    const { data: inserted, error: insertErr } = await supabase.from("artigos").insert(insertPayload).select("*").single();

    if (insertErr) {
      console.error("DB insert error:", insertErr);
      return new Response(JSON.stringify({ error: `Erro ao salvar: ${insertErr.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ artigo: inserted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("analisar-upload error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
