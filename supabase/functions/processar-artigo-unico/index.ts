import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface FullTextResult {
  texto: string | null;
  url: string | null;
  fonte: string;
  sucesso: boolean;
}

async function buscarDOI(pmid: string): Promise<string | null> {
  try {
    const res = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&retmode=xml`);
    if (!res.ok) { await res.body?.cancel(); return null; }
    const xml = await res.text();
    const match = xml.match(/<ArticleId IdType="doi">([^<]+)<\/ArticleId>/);
    return match ? match[1] : null;
  } catch { return null; }
}

// FONTE 1 — PubMed Central
async function buscarPMC(pmid: string): Promise<FullTextResult> {
  try {
    const convRes = await fetch(`https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/?ids=${pmid}&format=json`);
    if (!convRes.ok) { await convRes.body?.cancel(); return { texto: null, url: null, fonte: 'PMC', sucesso: false }; }
    const convData = await convRes.json();
    const pmcid = convData?.records?.[0]?.pmcid;
    if (!pmcid) return { texto: null, url: null, fonte: 'PMC', sucesso: false };

    const pmcRes = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=${pmcid}&retmode=text&rettype=fulltext`);
    if (!pmcRes.ok) { await pmcRes.body?.cancel(); return { texto: null, url: null, fonte: 'PMC', sucesso: false }; }
    const text = await pmcRes.text();
    if (text && text.trim().length > 500) {
      return { texto: text.substring(0, 8000), url: `https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcid}/`, fonte: 'PMC', sucesso: true };
    }
  } catch { /* fall through */ }
  return { texto: null, url: null, fonte: 'PMC', sucesso: false };
}

// FONTE 2 — Europa PMC
async function buscarEuropaPMC(pmid: string): Promise<FullTextResult> {
  try {
    const res = await fetch(`https://www.ebi.ac.uk/europepmc/webservices/rest/${pmid}/fullTextXML?source=MED`);
    if (!res.ok) { await res.body?.cancel(); return { texto: null, url: null, fonte: 'EuropaPMC', sucesso: false }; }
    const xmlText = await res.text();
    const texto = xmlText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (texto.length > 500) {
      return { texto: texto.substring(0, 8000), url: `https://europepmc.org/article/med/${pmid}`, fonte: 'EuropaPMC', sucesso: true };
    }
  } catch { /* fall through */ }
  return { texto: null, url: null, fonte: 'EuropaPMC', sucesso: false };
}

// FONTE 3 — Unpaywall
async function buscarUnpaywall(doi: string): Promise<FullTextResult> {
  try {
    const res = await fetch(`https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=medupdate@app.com`);
    if (!res.ok) { await res.body?.cancel(); return { texto: null, url: null, fonte: 'Unpaywall', sucesso: false }; }
    const data = await res.json();

    const pdfUrl = data?.best_oa_location?.url_for_pdf;
    const htmlUrl = data?.best_oa_location?.url;
    const allLocations = data?.oa_locations || [];

    // Try PDF first
    const pdfUrls = [pdfUrl, ...allLocations.map((l: any) => l.url_for_pdf)].filter(Boolean);
    for (const url of pdfUrls) {
      try {
        const pdfRes = await fetch(url, { headers: { Accept: "application/pdf" }, redirect: "follow" });
        if (!pdfRes.ok) { await pdfRes.body?.cancel(); continue; }
        const buffer = await pdfRes.arrayBuffer();
        const bytes = new Uint8Array(buffer.slice(0, 50000));
        const rawText = new TextDecoder('latin1').decode(bytes);
        const textoLegivel = rawText.replace(/[^\x20-\x7E\xC0-\xFF]/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 8000);
        if (textoLegivel.length > 500) {
          return { texto: textoLegivel, url, fonte: 'Unpaywall', sucesso: true };
        }
      } catch { continue; }
    }

    // Try HTML landing page
    if (htmlUrl) {
      try {
        const htmlRes = await fetch(htmlUrl, { headers: { Accept: "text/html" }, redirect: "follow" });
        if (htmlRes.ok) {
          const html = await htmlRes.text();
          const texto = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 8000);
          if (texto.length > 500) {
            return { texto, url: htmlUrl, fonte: 'Unpaywall', sucesso: true };
          }
        } else { await htmlRes.body?.cancel(); }
      } catch { /* fall through */ }
    }
  } catch { /* fall through */ }
  return { texto: null, url: null, fonte: 'Unpaywall', sucesso: false };
}

async function buscarTextoCompleto(pmid: string): Promise<FullTextResult> {
  // Fonte 1: PMC
  const pmc = await buscarPMC(pmid);
  if (pmc.sucesso) return pmc;

  // Fonte 2: Europa PMC
  const europa = await buscarEuropaPMC(pmid);
  if (europa.sucesso) return europa;

  // Fonte 3: Unpaywall (needs DOI)
  const doi = await buscarDOI(pmid);
  if (doi) {
    const unpay = await buscarUnpaywall(doi);
    if (unpay.sucesso) return unpay;
  }

  return { texto: null, url: null, fonte: 'abstract', sucesso: false };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pmid } = await req.json();
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

    const { data: existing } = await supabase.from("artigos").select("id").eq("pmid", pmid).maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ id: existing.id, already_existed: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch abstract
    const abstractRes = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&retmode=text&rettype=abstract`);
    const abstractText = await abstractRes.text();
    if (!abstractText || abstractText.trim().length < 50) {
      return new Response(JSON.stringify({ error: "Abstract muito curto ou indisponível" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Cascading full-text search
    const fullText = await buscarTextoCompleto(pmid);
    console.log(`PMID ${pmid}: fonte=${fullText.fonte}, sucesso=${fullText.sucesso}, chars=${fullText.texto?.length || 0}`);

    let conteudoParaClaude: string;
    let instrucaoExtra: string;

    if (fullText.sucesso && fullText.texto) {
      conteudoParaClaude = fullText.texto;
      instrucaoExtra = `Você tem acesso ao TEXTO COMPLETO deste artigo médico (fonte: ${fullText.fonte}).
Faça uma análise metodológica DETALHADA incluindo:
- Método exato de randomização descrito pelos autores
- Tipo de cegamento (duplo-cego, simples, aberto)
- Análise por intenção de tratar: sim/não/parcial
- Tamanho amostral e poder estatístico reportado
- Desfechos primários e secundários pré-especificados
- Taxa de perda de seguimento e como foi manejada
- Limitações declaradas pelos próprios autores
- Conflitos de interesse reportados no artigo
- Financiamento do estudo

Retorne o JSON com análise_metodologica, vieses_detalhados, limitacoes_autores e conflitos_interesse preenchidos em detalhe.`;
    } else {
      conteudoParaClaude = abstractText;
      instrucaoExtra = `Você tem apenas o abstract. Faça a melhor análise possível mas sinalize explicitamente quais domínios do RoB 2 não puderam ser avaliados por falta de informação no abstract. Inclua na analise_metodologica: '[Baseado apenas no abstract — alguns domínios podem não ter sido avaliados por falta de informação]'`;
    }

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2500,
        messages: [{ role: "user", content: `Você é especialista em epidemiologia clínica. ${instrucaoExtra}\n\nAnalise este artigo médico e retorne SOMENTE um JSON válido, sem texto antes ou depois, sem markdown:\n{\n  "titulo": "título em português",\n  "journal": "nome do journal",\n  "ano": 2024,\n  "resumo_pt": "3 frases em português para médicos especialistas",\n  "tipo_estudo": "tipo do estudo",\n  "grade": "Alto, Moderado, Baixo ou Muito baixo",\n  "grade_justificativa": "uma frase",\n  "rob_resultado": "Baixo risco, Algumas preocupações ou Alto risco",\n  "analise_metodologica": "3-4 frases sobre metodologia",\n  "contexto_vs_anterior": "como este artigo se relaciona com o que já se sabia",\n  "vieses_detalhados": "lista detalhada dos vieses identificados por domínio RoB 2",\n  "limitacoes_autores": "limitações declaradas pelos próprios autores do artigo",\n  "conflitos_interesse": "conflitos de interesse reportados no artigo",\n  "questao": "caso clínico de 2-3 frases para quiz",\n  "alt_a": "alternativa A",\n  "alt_b": "alternativa B",\n  "alt_c": "alternativa C",\n  "alt_d": "alternativa D",\n  "resposta_correta": "A, B, C ou D",\n  "feedback_quiz": "2-3 frases explicando a resposta correta"\n}\n\nArtigo:\n${conteudoParaClaude}` }],
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
      tem_texto_completo: fullText.sucesso,
      url_texto_completo: fullText.url,
      fonte_texto: fullText.fonte,
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
