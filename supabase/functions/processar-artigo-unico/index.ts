import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PMC-only fallback (para quando frontend não enviou texto)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function tentarPMC(pmid: string): Promise<{ texto: string; fonte: string; completo: boolean; url: string | null } | null> {
  try {
    const idConvResp = await fetch(
      `https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/?ids=${pmid}&format=json&email=medupdate@app.com`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!idConvResp.ok) return null;
    const idConvData = await idConvResp.json();
    const pmcid = idConvData?.records?.[0]?.pmcid;
    if (!pmcid) return null;

    const pmcResp = await fetch(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=${pmcid}&retmode=text&rettype=fulltext&email=medupdate@app.com`,
      { signal: AbortSignal.timeout(15000) }
    );
    const texto = await pmcResp.text();
    if (texto.length > 3000) {
      return {
        texto: texto.substring(0, 12000),
        fonte: 'PubMed Central',
        completo: true,
        url: `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/`,
      };
    }
  } catch (e) {
    console.log(`[PMC] Erro: ${e}`);
  }
  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HANDLER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const pmid = body.pmid;
    const textoCompleto = body.textoCompleto as string | undefined;
    const fonteTexto = body.fonteTexto as string | undefined;
    const urlTextoCompleto = body.urlTextoCompleto as string | undefined;

    if (!pmid || typeof pmid !== "string") {
      return new Response(JSON.stringify({ error: "PMID é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY não configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Verificar se já existe
    const { data: existing } = await supabase.from("artigos").select("id").eq("pmid", pmid).maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ id: existing.id, already_existed: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Buscar abstract
    const abstractRes = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&retmode=text&rettype=abstract`);
    const abstractText = await abstractRes.text();
    if (!abstractText || abstractText.trim().length < 50) {
      return new Response(JSON.stringify({ error: "Abstract muito curto ou indisponível" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Determinar texto para análise
    let textoParaAnalise: string;
    let temTextoCompleto: boolean;
    let fonteUsada: string;
    let urlUsada: string | null;

    if (textoCompleto && textoCompleto.length > 3000) {
      // Frontend enviou texto completo
      console.log(`PMID ${pmid}: usando texto do frontend (${textoCompleto.length} chars, fonte: ${fonteTexto})`);
      textoParaAnalise = textoCompleto;
      temTextoCompleto = true;
      fonteUsada = fonteTexto || 'Texto completo';
      urlUsada = urlTextoCompleto || null;
    } else {
      // Tentar PMC como fallback server-side
      const pmcResult = await tentarPMC(pmid);
      if (pmcResult) {
        console.log(`PMID ${pmid}: texto via PMC server-side (${pmcResult.texto.length} chars)`);
        textoParaAnalise = pmcResult.texto;
        temTextoCompleto = true;
        fonteUsada = pmcResult.fonte;
        urlUsada = pmcResult.url;
      } else {
        console.log(`PMID ${pmid}: usando abstract (${abstractText.length} chars)`);
        textoParaAnalise = abstractText;
        temTextoCompleto = false;
        fonteUsada = 'abstract';
        urlUsada = null;
      }
    }

    // Prompt para Claude
    let instrucaoExtra: string;
    if (temTextoCompleto) {
      instrucaoExtra = `Você tem acesso ao TEXTO COMPLETO deste artigo (fonte: ${fonteUsada}).
Analise com profundidade máxima, usando informações específicas do texto. Inclua no JSON:
- analise_metodologica: método de randomização, cegamento, ITT, tamanho amostral, poder estatístico
- vieses_detalhados: avaliação por domínio RoB 2 com julgamento e justificativa específica para cada domínio
- limitacoes_autores: limitações declaradas pelos próprios autores
- conflitos_interesse: conflitos e financiamento reportados

Texto completo (${textoParaAnalise.length} chars):
${textoParaAnalise}`;
    } else {
      instrucaoExtra = `Você tem apenas o ABSTRACT. Faça a melhor análise possível. Nos campos vieses_detalhados e limitacoes_autores, indique explicitamente quais aspectos não puderam ser avaliados por limitação do abstract.

Abstract:
${abstractText}`;
    }

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2500,
        messages: [{ role: "user", content: `Você é especialista em epidemiologia clínica. ${instrucaoExtra}\n\nAnalise este artigo médico e retorne SOMENTE um JSON válido, sem texto antes ou depois, sem markdown:\n{\n  "titulo": "título em português",\n  "journal": "nome do journal",\n  "ano": 2024,\n  "resumo_pt": "3 frases em português para médicos especialistas",\n  "tipo_estudo": "tipo do estudo",\n  "grade": "Alto, Moderado, Baixo ou Muito baixo",\n  "grade_justificativa": "uma frase",\n  "rob_resultado": "Baixo risco, Algumas preocupações ou Alto risco",\n  "analise_metodologica": "3-4 frases sobre metodologia",\n  "contexto_vs_anterior": "como este artigo se relaciona com o que já se sabia",\n  "vieses_detalhados": "lista detalhada dos vieses identificados por domínio RoB 2",\n  "limitacoes_autores": "limitações declaradas pelos próprios autores do artigo",\n  "conflitos_interesse": "conflitos de interesse reportados no artigo",\n  "questao": "caso clínico de 2-3 frases para quiz",\n  "alt_a": "alternativa A",\n  "alt_b": "alternativa B",\n  "alt_c": "alternativa C",\n  "alt_d": "alternativa D",\n  "resposta_correta": "A, B, C ou D",\n  "feedback_quiz": "2-3 frases explicando a resposta correta"\n}\n\nArtigo:\n${textoParaAnalise}` }],
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

    const ano = parsed.ano ?? new Date().getFullYear();

    const { data: inserted, error: insertErr } = await supabase.from("artigos").insert({
      titulo: parsed.titulo || `Artigo ${pmid}`,
      journal: parsed.journal || null,
      ano,
      especialidade: "Cardiologia",
      resumo_pt: parsed.resumo_pt || null,
      tipo_estudo: parsed.tipo_estudo || null,
      grade: parsed.grade || null,
      grade_justificativa: parsed.grade_justificativa || null,
      rob_resultado: parsed.rob_resultado || null,
      analise_metodologica: parsed.analise_metodologica || null,
      contexto_vs_anterior: parsed.contexto_vs_anterior || null,
      vieses_detalhados: parsed.vieses_detalhados || null,
      limitacoes_autores: parsed.limitacoes_autores || null,
      conflitos_interesse: parsed.conflitos_interesse || null,
      questao: parsed.questao || null,
      alt_a: parsed.alt_a || null,
      alt_b: parsed.alt_b || null,
      alt_c: parsed.alt_c || null,
      alt_d: parsed.alt_d || null,
      resposta_correta: parsed.resposta_correta || null,
      feedback_quiz: parsed.feedback_quiz || null,
      pmid,
      link_original: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      citacoes: 0,
      score_relevancia: (ano - 2020) * 10 + 50,
      tem_texto_completo: temTextoCompleto,
      url_texto_completo: urlUsada,
      fonte_texto: fonteUsada,
      data_publicacao: `${ano}-01-01`,
    }).select("id, resumo_pt, grade").single();

    if (insertErr) {
      return new Response(JSON.stringify({ error: `Erro ao salvar: ${insertErr.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ id: inserted.id, resumo_pt: inserted.resumo_pt, grade: inserted.grade, already_existed: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("processar-artigo-unico error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
