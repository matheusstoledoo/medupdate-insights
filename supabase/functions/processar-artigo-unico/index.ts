import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function buscarDOI(pmid: string): Promise<string | null> {
  try {
    const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&retmode=xml`;
    const res = await fetch(url);
    if (!res.ok) { await res.body?.cancel(); return null; }
    const xml = await res.text();
    const match = xml.match(/<ArticleId IdType="doi">([^<]+)<\/ArticleId>/);
    return match ? match[1] : null;
  } catch { return null; }
}

async function buscarPMCID(pmid: string): Promise<string | null> {
  try {
    const url = `https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/?ids=${pmid}&format=json`;
    const res = await fetch(url);
    if (!res.ok) { await res.body?.cancel(); return null; }
    const data = await res.json();
    return data?.records?.[0]?.pmcid || null;
  } catch { return null; }
}

async function buscarTextoCompletoPMC(pmcid: string): Promise<string | null> {
  try {
    const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=${pmcid}&retmode=text&rettype=fulltext`;
    const res = await fetch(url);
    if (!res.ok) { await res.body?.cancel(); return null; }
    const text = await res.text();
    return text && text.trim().length > 100 ? text : null;
  } catch { return null; }
}

async function buscarUnpaywall(doi: string): Promise<string | null> {
  try {
    const url = `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=medupdate@app.com`;
    const res = await fetch(url);
    if (!res.ok) { await res.body?.cancel(); return null; }
    const data = await res.json();
    return data?.best_oa_location?.url_for_pdf || data?.best_oa_location?.url || null;
  } catch { return null; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pmid } = await req.json();
    if (!pmid || typeof pmid !== "string") {
      return new Response(
        JSON.stringify({ error: "PMID é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY não configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if already exists
    const { data: existing } = await supabase
      .from("artigos")
      .select("id")
      .eq("pmid", pmid)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ id: existing.id, already_existed: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch abstract
    const abstractUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&retmode=text&rettype=abstract`;
    const abstractRes = await fetch(abstractUrl);
    const abstractText = await abstractRes.text();

    if (!abstractText || abstractText.trim().length < 50) {
      return new Response(
        JSON.stringify({ error: "Abstract muito curto ou indisponível" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Try full text via PMC then Unpaywall
    let textoCompleto: string | null = null;
    let urlTextoCompleto: string | null = null;
    let temTextoCompleto = false;

    const pmcid = await buscarPMCID(pmid);
    if (pmcid) {
      const pmcText = await buscarTextoCompletoPMC(pmcid);
      if (pmcText) {
        textoCompleto = pmcText;
        urlTextoCompleto = `https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcid}/`;
        temTextoCompleto = true;
      }
    }

    if (!textoCompleto) {
      const doi = await buscarDOI(pmid);
      if (doi) {
        const unpUrl = await buscarUnpaywall(doi);
        if (unpUrl) {
          urlTextoCompleto = unpUrl;
          try {
            const fullRes = await fetch(unpUrl, {
              headers: { Accept: "text/plain, text/html" },
              redirect: "follow",
            });
            if (fullRes.ok) {
              const ct = fullRes.headers.get("content-type") || "";
              if (!ct.includes("pdf")) {
                const fullText = await fullRes.text();
                if (fullText && fullText.trim().length > 200) {
                  textoCompleto = fullText;
                  temTextoCompleto = true;
                }
              } else { await fullRes.body?.cancel(); }
            } else { await fullRes.body?.cancel(); }
          } catch { /* continue with abstract */ }
        }
      }
    }

    let conteudoParaClaude: string;
    let instrucaoExtra: string;

    if (temTextoCompleto && textoCompleto) {
      conteudoParaClaude = textoCompleto.substring(0, 8000);
      instrucaoExtra = `Você tem acesso ao texto completo deste artigo. Faça uma análise metodológica detalhada incluindo: tamanho amostral, método de randomização, tipo de cegamento, análise por intenção de tratar, desfechos primários e secundários, limitações declaradas pelos autores, e conflitos de interesse reportados.`;
    } else {
      conteudoParaClaude = abstractText;
      instrucaoExtra = `Você tem apenas o abstract. Faça a melhor análise possível mas sinalize explicitamente quais domínios do RoB 2 não puderam ser avaliados por falta de informação no abstract.`;
    }

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2500,
        messages: [{
          role: "user",
          content: `Você é especialista em epidemiologia clínica. ${instrucaoExtra}\n\nAnalise este artigo médico e retorne SOMENTE um JSON válido, sem texto antes ou depois, sem markdown:\n{\n  "titulo": "título em português",\n  "journal": "nome do journal",\n  "ano": 2024,\n  "resumo_pt": "3 frases em português para médicos especialistas",\n  "tipo_estudo": "tipo do estudo",\n  "grade": "Alto, Moderado, Baixo ou Muito baixo",\n  "grade_justificativa": "uma frase",\n  "rob_resultado": "Baixo risco, Algumas preocupações ou Alto risco",\n  "analise_metodologica": "3-4 frases sobre metodologia",\n  "contexto_vs_anterior": "como este artigo se relaciona com o que já se sabia",\n  "vieses_detalhados": "lista detalhada dos vieses identificados por domínio RoB 2",\n  "limitacoes_autores": "limitações declaradas pelos próprios autores do artigo",\n  "conflitos_interesse": "conflitos de interesse reportados no artigo",\n  "questao": "caso clínico de 2-3 frases para quiz",\n  "alt_a": "alternativa A",\n  "alt_b": "alternativa B",\n  "alt_c": "alternativa C",\n  "alt_d": "alternativa D",\n  "resposta_correta": "A, B, C ou D",\n  "feedback_quiz": "2-3 frases explicando a resposta correta"\n}\n\nArtigo:\n${conteudoParaClaude}`,
        }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      console.error("Claude API error:", claudeRes.status, errText);
      return new Response(
        JSON.stringify({ error: "Erro ao analisar artigo com IA" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const claudeData = await claudeRes.json();
    const rawContent = claudeData?.content?.[0]?.text ?? "";

    let parsed: Record<string, any>;
    try {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found");
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return new Response(
        JSON.stringify({ error: "Resposta da IA inválida" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ano = parsed.ano ?? new Date().getFullYear();
    const scoreRelevancia = (ano - 2020) * 10 + 50;

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
      score_relevancia: scoreRelevancia,
      tem_texto_completo: temTextoCompleto,
      url_texto_completo: urlTextoCompleto,
      data_publicacao: `${ano}-01-01`,
    }).select("id, resumo_pt, grade").single();

    if (insertErr) {
      return new Response(
        JSON.stringify({ error: `Erro ao salvar: ${insertErr.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ id: inserted.id, resumo_pt: inserted.resumo_pt, grade: inserted.grade, already_existed: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("processar-artigo-unico error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
