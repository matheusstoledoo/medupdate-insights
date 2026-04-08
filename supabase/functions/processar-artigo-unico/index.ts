import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function buildPrompt(textoParaAnalise: string, fonteUsada: string, temTextoCompleto: boolean): string {
  return `Você é um cardiologista especialista em medicina baseada em evidências. Você recebeu o ${temTextoCompleto ? `texto completo (fonte: ${fonteUsada})` : 'ABSTRACT apenas'} de um artigo científico e deve gerar uma análise estruturada, robusta e clinicamente útil, suficiente para que um médico possa entender e interpretar o estudo sem precisar ler o original.

${!temTextoCompleto ? 'ATENÇÃO: Você tem apenas o abstract. Faça a melhor análise possível. Indique claramente quando não foi possível avaliar por falta de informação.' : ''}

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
  "journal": "nome do periódico",
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

Texto do artigo (fonte: ${fonteUsada}, ${textoParaAnalise.length} chars):
${textoParaAnalise}`;
}

function buildInsertPayload(parsed: Record<string, any>, extras: Record<string, any>) {
  const analiseCompleta: Record<string, any> = {};
  if (parsed.metodologia) analiseCompleta.metodologia = parsed.metodologia;
  if (parsed.resultados) analiseCompleta.resultados = parsed.resultados;
  if (parsed.conclusao) analiseCompleta.conclusao = parsed.conclusao;

  return {
    titulo: parsed.titulo || extras.titulo || "Artigo sem título",
    journal: parsed.journal || extras.journal || null,
    ano: parsed.ano || extras.ano || new Date().getFullYear(),
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
    ...extras,
  };
}

async function buscarPMCID(pmid: string): Promise<string | null> {
  try {
    const resp = await fetch(
      `https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/?ids=${pmid}&format=json&email=medupdate@app.com`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.records?.[0]?.pmcid || null;
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

    const { data: existing } = await supabase
      .from("artigos")
      .select("id, resumo_pt, grade")
      .eq("pmid", pmid)
      .maybeSingle();
    if (existing) {
      return new Response(
        JSON.stringify({ id: existing.id, resumo_pt: existing.resumo_pt, grade: existing.grade, already_existed: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ETAPA 1 — EFetch metadata
    const efetchResp = await fetch(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&retmode=xml&email=medupdate@app.com`,
      { signal: AbortSignal.timeout(20000) }
    );
    if (!efetchResp.ok) throw new Error(`EFetch HTTP ${efetchResp.status}`);
    const xml = await efetchResp.text();

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

    // ETAPA 2 — Full text
    let textoAnalise = abstractText;
    let temTextoCompleto = false;
    let fonteTexto = "abstract";
    let urlTextoCompleto: string | null = null;

    if (textoFrontend && textoFrontend.length > 3000) {
      textoAnalise = textoFrontend.substring(0, 15000);
      temTextoCompleto = true;
      fonteTexto = fonteFrontend || "Texto completo";
    }

    if (!temTextoCompleto) {
      const pmcid = pmcidXml || (await buscarPMCID(pmid));
      if (pmcid) {
        try {
         const pmcResp = await fetch(
  `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/`,
  {
    headers: { "User-Agent": "MedUpdate/1.0 (medupdate@app.com)" },
    signal: AbortSignal.timeout(20000),
  }
);
if (pmcResp.ok) {
  const htmlBruto = await pmcResp.text();
  const pmcTexto = htmlBruto
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s{3,}/g, "\n\n")
    .trim();
  if (pmcTexto.length > 3000) {
    textoAnalise = pmcTexto.substring(0, 30000);
    temTextoCompleto = true;
    fonteTexto = "PubMed Central";
    urlTextoCompleto = `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/`;
  }
}
          }
        } catch (e) {
          console.log(`[PMC] erro: ${e}`);
        }
      }
    }

    if (!temTextoCompleto) {
      try {
        const europaResp = await fetch(
          `https://www.ebi.ac.uk/europepmc/webservices/rest/${pmid}/fullTextXML?source=MED`,
          { signal: AbortSignal.timeout(15000) }
        );
        if (europaResp.ok) {
          const europaXml = await europaResp.text();
          const textoLimpo = europaXml.replace(/<[^>]+>/g, " ").replace(/\s{3,}/g, "\n\n").trim();
          if (textoLimpo.length > 3000) {
            textoAnalise = textoLimpo.substring(0, 15000);
            temTextoCompleto = true;
            fonteTexto = "Europe PMC";
            urlTextoCompleto = `https://europepmc.org/article/med/${pmid}`;
          }
        }
      } catch (e) {
        console.log(`[Europa PMC] erro: ${e}`);
      }
    }

    // ETAPA 3 — Claude API
    console.log(`[ETAPA 3] Claude — fonte: ${fonteTexto} — ${textoAnalise.length} chars`);

    const promptAnalise = buildPrompt(textoAnalise, fonteTexto, temTextoCompleto);

    const claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8000,
        messages: [{ role: "user", content: promptAnalise }],
      }),
      signal: AbortSignal.timeout(120000),
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

    // ETAPA 4 — Save
    const linkFinal = urlTextoCompleto || (doi ? `https://doi.org/${doi}` : `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`);
    const anoFinal = analise.ano || ano || new Date().getFullYear();

    const insertPayload = buildInsertPayload(analise, {
      titulo: titulo,
      journal: journal,
      ano: anoFinal,
      pmid,
      link_original: linkFinal,
      citacoes: 0,
      score_relevancia: (anoFinal - 2020) * 10 + 50,
      tem_texto_completo: temTextoCompleto,
      url_texto_completo: temTextoCompleto ? urlTextoCompleto : null,
      fonte_texto: fonteTexto,
      data_publicacao: anoFinal ? `${anoFinal}-01-01` : null,
    });

    const { data: inserted, error: insertErr } = await supabase
      .from("artigos")
      .insert(insertPayload)
      .select("id, resumo_pt, grade")
      .single();

    if (insertErr) throw new Error(`Salvar: ${insertErr.message}`);

    console.log(`[FIM] ✓ PMID ${pmid} — fonte: ${fonteTexto} — completo: ${temTextoCompleto}`);

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
