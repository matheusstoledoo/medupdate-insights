import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function buscarPMCID(pmid: string): Promise<string | null> {
  try {
    const resp = await fetch(
      `https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/?ids=${pmid}&format=json&email=medupdate@app.com`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    const pmcid = data.records?.[0]?.pmcid || null;
    console.log(`[PMC-LOOKUP] ${pmcid || "não encontrado"}`);
    return pmcid;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const pmid = body.pmid;
    const textoFrontend: string | null = body.textoCompleto || null;
    const fonteFrontend: string | null = body.fonteTexto || null;

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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    console.log(`[INÍCIO] PMID: ${pmid}`);

    // Check if already exists
    const { data: existing } = await supabase
      .from("artigos")
      .select("id, resumo_pt, grade")
      .eq("pmid", pmid)
      .maybeSingle();
    if (existing) {
      console.log(`[INÍCIO] Já existe: ${existing.id}`);
      return new Response(
        JSON.stringify({ id: existing.id, resumo_pt: existing.resumo_pt, grade: existing.grade, already_existed: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ETAPA 1 — Buscar metadados e abstract via EFetch
    console.log(`[ETAPA 1] EFetch para PMID ${pmid}`);
    const efetchResp = await fetch(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&retmode=xml&email=medupdate@app.com`,
      { signal: AbortSignal.timeout(20000) }
    );
    if (!efetchResp.ok) throw new Error(`EFetch HTTP ${efetchResp.status}`);
    const xml = await efetchResp.text();
    console.log(`[ETAPA 1] XML: ${xml.length} chars`);

    const titulo = xml.match(/<ArticleTitle>([^<]+)<\/ArticleTitle>/)?.[1]?.trim() || "";
    const journal =
      xml.match(/<ISOAbbreviation>([^<]+)<\/ISOAbbreviation>/)?.[1]?.trim() ||
      xml.match(/<Title>([^<]+)<\/Title>/)?.[1]?.trim() || "";
    const ano = parseInt(xml.match(/<PubDate>[\s\S]*?<Year>(\d{4})<\/Year>/)?.[1] || "0");
    const doi = xml.match(/<ArticleId IdType="doi">([^<]+)<\/ArticleId>/)?.[1]?.trim();
    const pmcidXml = xml.match(/<ArticleId IdType="pmc">(PMC\d+)<\/ArticleId>/)?.[1]?.trim();

    const abstractBlocos = [...xml.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g)];
    const abstractText = abstractBlocos
      .map((b) => b[1].replace(/<[^>]+>/g, "").trim())
      .filter((t) => t.length > 0)
      .join("\n\n")
      .trim();

    console.log(`[ETAPA 1] Título: ${titulo.substring(0, 80)} | Journal: ${journal} | Ano: ${ano}`);
    console.log(`[ETAPA 1] PMCID no XML: ${pmcidXml || "não encontrado"} | Abstract: ${abstractText.length} chars`);

    // ETAPA 2 — Obter texto completo
    let textoAnalise = abstractText;
    let temTextoCompleto = false;
    let fonteTexto = "abstract";
    let urlTextoCompleto: string | null = null;

    // Prioridade 1: texto enviado pelo browser (frontend)
    if (textoFrontend && textoFrontend.length > 3000) {
      textoAnalise = textoFrontend.substring(0, 12000);
      temTextoCompleto = true;
      fonteTexto = fonteFrontend || "Texto completo";
      console.log(`[ETAPA 2] ✓ Texto do frontend: ${textoAnalise.length} chars (${fonteTexto})`);
    }

    // Prioridade 2: PMC via API do servidor
    if (!temTextoCompleto) {
      const pmcid = pmcidXml || (await buscarPMCID(pmid));
      if (pmcid) {
        console.log(`[ETAPA 2] Tentando PMC: ${pmcid}`);
        try {
          const pmcResp = await fetch(
            `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=${pmcid}&retmode=text&rettype=fulltext&email=medupdate@app.com`,
            { signal: AbortSignal.timeout(20000) }
          );
          if (pmcResp.ok) {
            const pmcTexto = await pmcResp.text();
            console.log(`[ETAPA 2] PMC texto: ${pmcTexto.length} chars`);
            if (pmcTexto.length > 3000) {
              textoAnalise = pmcTexto.substring(0, 12000);
              temTextoCompleto = true;
              fonteTexto = "PubMed Central";
              urlTextoCompleto = `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/`;
              console.log(`[ETAPA 2] ✓ Texto completo via PMC`);
            }
          }
        } catch (e) {
          console.log(`[ETAPA 2] PMC erro: ${e}`);
        }
      }
    }

    // Prioridade 3: Europa PMC
    if (!temTextoCompleto) {
      console.log(`[ETAPA 2] Tentando Europa PMC`);
      try {
        const europaResp = await fetch(
          `https://www.ebi.ac.uk/europepmc/webservices/rest/${pmid}/fullTextXML?source=MED`,
          { signal: AbortSignal.timeout(15000) }
        );
        if (europaResp.ok) {
          const europaXml = await europaResp.text();
          const textoLimpo = europaXml
            .replace(/<[^>]+>/g, " ")
            .replace(/\s{3,}/g, "\n\n")
            .trim();
          console.log(`[ETAPA 2] Europa PMC: ${textoLimpo.length} chars`);
          if (textoLimpo.length > 3000) {
            textoAnalise = textoLimpo.substring(0, 12000);
            temTextoCompleto = true;
            fonteTexto = "Europe PMC";
            urlTextoCompleto = `https://europepmc.org/article/med/${pmid}`;
            console.log(`[ETAPA 2] ✓ Texto completo via Europa PMC`);
          }
        }
      } catch (e) {
        console.log(`[ETAPA 2] Europa PMC erro: ${e}`);
      }
    }

    if (!temTextoCompleto) {
      console.log(`[ETAPA 2] Usando abstract (${abstractText.length} chars)`);
    }

    // ETAPA 3 — Claude API
    console.log(`[ETAPA 3] Claude API — fonte: ${fonteTexto} — ${textoAnalise.length} chars`);

    const promptCtx = temTextoCompleto
      ? `Você tem o TEXTO COMPLETO deste artigo (fonte: ${fonteTexto}). Faça análise metodológica DETALHADA: método de randomização, cegamento, análise ITT, tamanho amostral, limitações dos autores, conflitos de interesse.`
      : `Você tem apenas o ABSTRACT. Faça a melhor análise possível. Indique nos campos vieses_detalhados e limitacoes_autores quando não foi possível avaliar por falta de informação no abstract.`;

    const claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2500,
        messages: [
          {
            role: "user",
            content: `${promptCtx}\n\nRetorne SOMENTE um JSON válido:\n{\n"titulo":"título em português",\n"journal":"nome do journal",\n"ano":2024,\n"resumo_pt":"3-4 frases em português para especialistas",\n"tipo_estudo":"tipo do estudo",\n"grade":"Alto, Moderado, Baixo ou Muito baixo",\n"grade_justificativa":"uma frase",\n"rob_resultado":"Baixo risco, Algumas preocupações ou Alto risco",\n"analise_metodologica":"4-5 frases detalhadas",\n"vieses_detalhados":"avaliação por domínio RoB 2",\n"limitacoes_autores":"limitações declaradas pelos autores",\n"conflitos_interesse":"conflitos e financiamento",\n"contexto_vs_anterior":"relação com evidência anterior",\n"questao":"caso clínico 2-3 frases",\n"alt_a":"","alt_b":"","alt_c":"","alt_d":"",\n"resposta_correta":"A, B, C ou D",\n"feedback_quiz":"2-3 frases com impacto clínico"\n}\n\nArtigo (${fonteTexto}, ${textoAnalise.length} chars):\n${textoAnalise}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!claudeResp.ok) {
      const errText = await claudeResp.text();
      console.error("Claude API error:", claudeResp.status, errText);
      throw new Error(`Claude HTTP ${claudeResp.status}`);
    }

    const claudeData = await claudeResp.json();
    const rawJson = claudeData.content?.[0]?.text || "";
    const jsonMatch = rawJson.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Claude não retornou JSON");
    const analise = JSON.parse(jsonMatch[0]);
    console.log(`[ETAPA 3] ✓ Claude respondeu`);

    // ETAPA 4 — Salvar no banco
    const linkFinal =
      urlTextoCompleto ||
      (doi ? `https://doi.org/${doi}` : `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`);

    const anoFinal = analise.ano || ano || new Date().getFullYear();

    const { data: inserted, error: insertErr } = await supabase
      .from("artigos")
      .insert({
        titulo: analise.titulo || titulo || `Artigo ${pmid}`,
        journal: analise.journal || journal || null,
        ano: anoFinal,
        especialidade: "Cardiologia",
        pmid,
        link_original: linkFinal,
        resumo_pt: analise.resumo_pt || null,
        tipo_estudo: analise.tipo_estudo || null,
        grade: analise.grade || null,
        grade_justificativa: analise.grade_justificativa || null,
        rob_resultado: analise.rob_resultado || null,
        analise_metodologica: analise.analise_metodologica || null,
        vieses_detalhados: analise.vieses_detalhados || null,
        limitacoes_autores: analise.limitacoes_autores || null,
        conflitos_interesse: analise.conflitos_interesse || null,
        contexto_vs_anterior: analise.contexto_vs_anterior || null,
        questao: analise.questao || null,
        alt_a: analise.alt_a || null,
        alt_b: analise.alt_b || null,
        alt_c: analise.alt_c || null,
        alt_d: analise.alt_d || null,
        resposta_correta: analise.resposta_correta || null,
        feedback_quiz: analise.feedback_quiz || null,
        tem_texto_completo: temTextoCompleto,
        url_texto_completo: temTextoCompleto ? urlTextoCompleto : null,
        fonte_texto: fonteTexto,
        citacoes: 0,
        score_relevancia: (anoFinal - 2020) * 10 + 50,
        data_publicacao: anoFinal ? `${anoFinal}-01-01` : null,
      })
      .select("id, resumo_pt, grade")
      .single();

    if (insertErr) {
      throw new Error(`Salvar: ${insertErr.message}`);
    }

    console.log(`[FIM] ✓ PMID ${pmid} — fonte: ${fonteTexto} — completo: ${temTextoCompleto}`);

    return new Response(
      JSON.stringify({
        id: inserted.id,
        resumo_pt: inserted.resumo_pt,
        grade: inserted.grade,
        already_existed: false,
      }),
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
