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

    const promptAnalise = `Você é especialista em epidemiologia clínica e medicina baseada em evidências, analisando artigos para cardiologistas brasileiros.

${temTextoCompleto ? `Você tem o TEXTO COMPLETO deste artigo (fonte: ${fonteTexto}).` : `Você tem apenas o ABSTRACT. Faça a melhor análise possível. Indique quando não foi possível avaliar por falta de informação.`}

Analise o artigo abaixo com profundidade máxima.

PASSO 1 — Identifique o tipo de estudo:
- Ensaio Clínico Randomizado (RCT)
- Revisão Sistemática ou Meta-análise
- Estudo de Coorte
- Estudo Caso-Controle
- Estudo Transversal
- Guideline / Consenso
- Outro (especificar)

PASSO 2 — Aplique as ferramentas corretas:

SE for RCT:
- RoB 2: avalie os 5 domínios (D1 randomização, D2 desvios da intervenção, D3 dados incompletos, D4 mensuração do desfecho, D5 seleção do resultado). Para cada domínio: julgamento (baixo risco / algumas preocupações / alto risco) + justificativa específica.
- Jadad Scale: pontue randomização (0-2) + cegamento (0-2) + perdas/exclusões (0-1). Score total 0-5. ≥3 = boa qualidade.
- CASP RCT: avalie validade, resultados e aplicabilidade clínica.

SE for Revisão Sistemática ou Meta-análise:
- AMSTAR 2: classifique como alta / moderada / baixa / criticamente baixa qualidade com justificativa nos domínios críticos.
- ROBIS: avalie risco de viés em 3 fases (relevância do escopo, condução da revisão, julgamento final).
- CASP SR: avalie validade, resultados e aplicabilidade.
- GRADE da evidência: classifique a qualidade da evidência gerada.

SE for Coorte:
- CASP Cohort: avalie seleção, mensuração de exposição, seguimento e desfechos.
- Newcastle-Ottawa Scale: pontue seleção (0-4), comparabilidade (0-2), desfecho (0-3).

SE for Caso-Controle:
- CASP Case-Control: avalie validade interna e externa.
- Newcastle-Ottawa Scale adaptada para caso-controle.

SE for Guideline/Consenso:
- AGREE II resumido: avalie escopo, envolvimento de stakeholders, rigor de desenvolvimento, clareza, aplicabilidade.

PASSO 3 — Retorne SOMENTE este JSON válido, sem texto antes ou depois:
{
  "titulo": "título completo em português",
  "journal": "nome do periódico",
  "ano": 2024,
  "tipo_estudo": "tipo exato identificado no Passo 1",
  "ferramentas_usadas": "lista das ferramentas aplicadas separadas por vírgula",
  "resumo_pt": "2-3 frases sintetizando o artigo",
  "introducao_resumo": "contexto clínico, lacuna na evidência e justificativa do estudo em 2-3 frases",
  "metodologia_detalhada": "desenho do estudo, população (n, critérios inclusão/exclusão), intervenção vs controle, desfecho primário e secundários, seguimento, método de randomização e cegamento quando aplicável, análise estatística principal",
  "resultados_principais": "desfecho primário com resultado numérico, IC 95% e valor p. Desfechos secundários relevantes. Eventos adversos. NNT ou NNH quando calculável.",
  "conclusao_autores": "conclusão declarada pelos autores",
  "implicacao_clinica": "impacto direto na prática clínica em 1-2 frases objetivas",
  "grade": "Alto, Moderado, Baixo ou Muito baixo",
  "grade_justificativa": "justificativa específica referenciando os domínios GRADE",
  "rob_resultado": "Baixo risco, Algumas preocupações ou Alto risco (para RCT) / julgamento equivalente para outros tipos",
  "vieses_detalhados": "Para RCT — D1: [julgamento] — [justificativa]. D2-D5 idem. Para outros tipos — adaptar conforme ferramenta aplicada.",
  "jadad_score": null,
  "jadad_justificativa": "pontuação detalhada apenas se RCT: randomização X/2, cegamento X/2, perdas X/1. Total: X/5",
  "amstar2_classificacao": null,
  "amstar2_justificativa": "apenas se revisão sistemática: classificação e domínios críticos com problemas identificados",
  "robis_resultado": null,
  "robis_justificativa": "apenas se revisão sistemática: resultado das 3 fases do ROBIS",
  "analise_metodologica": "avaliação crítica independente em 3-4 frases: pontos fortes, limitações metodológicas e grau de confiança nas conclusões",
  "limitacoes_autores": "limitações declaradas pelos próprios autores",
  "conflitos_interesse": "conflitos de interesse e fonte de financiamento",
  "contexto_vs_anterior": "como este estudo muda, confirma ou contradiz a evidência prévia",
  "casp_resumo": "avaliação CASP resumida: válido? resultados importantes? aplicável à população brasileira?",
  "questao": "caso clínico de 2-3 frases baseado nos resultados do estudo",
  "alt_a": "", "alt_b": "", "alt_c": "", "alt_d": "",
  "resposta_correta": "A, B, C ou D",
  "feedback_quiz": "explicação da resposta correta com referência direta aos resultados do estudo e impacto no guideline"
}

Artigo (fonte: ${fonteTexto}, ${textoAnalise.length} chars):
${textoAnalise}`;

    const claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        messages: [{ role: "user", content: promptAnalise }],
      }),
      signal: AbortSignal.timeout(90000),
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
        introducao_resumo: analise.introducao_resumo || null,
        metodologia_detalhada: analise.metodologia_detalhada || null,
        resultados_principais: analise.resultados_principais || null,
        conclusao_autores: analise.conclusao_autores || null,
        implicacao_clinica: analise.implicacao_clinica || null,
        tipo_estudo: analise.tipo_estudo || null,
        ferramentas_usadas: analise.ferramentas_usadas || null,
        grade: analise.grade || null,
        grade_justificativa: analise.grade_justificativa || null,
        rob_resultado: analise.rob_resultado || null,
        analise_metodologica: analise.analise_metodologica || null,
        vieses_detalhados: analise.vieses_detalhados || null,
        jadad_score: analise.jadad_score || null,
        jadad_justificativa: analise.jadad_justificativa || null,
        amstar2_classificacao: analise.amstar2_classificacao || null,
        amstar2_justificativa: analise.amstar2_justificativa || null,
        robis_resultado: analise.robis_resultado || null,
        robis_justificativa: analise.robis_justificativa || null,
        casp_resumo: analise.casp_resumo || null,
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
