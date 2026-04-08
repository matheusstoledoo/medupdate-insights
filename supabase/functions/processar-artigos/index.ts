import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TEMAS_QUERIES: Record<string, string> = {
  "Insuficiência Cardíaca":
    '(heart failure[MeSH] OR "heart failure"[tiab]) AND (treatment[tiab] OR therapy[tiab] OR management[tiab])',
  "Arritmias / FA":
    '(atrial fibrillation[MeSH] OR arrhythmia[MeSH] OR "cardiac arrhythmia"[tiab])',
  "Cardiopatia Isquêmica":
    '(myocardial infarction[MeSH] OR "coronary artery disease"[MeSH] OR ACS[tiab])',
  "Hipertensão Arterial":
    '(hypertension[MeSH] OR "blood pressure"[tiab]) AND (treatment[tiab] OR therapy[tiab])',
  "Valvopatias":
    "(heart valve diseases[MeSH] OR aortic stenosis[MeSH] OR mitral valve[MeSH])",
  "Cardiologia Preventiva":
    "(cardiovascular diseases[MeSH]) AND (prevention[tiab] OR risk factors[MeSH])",
  "Miocardiopatias": "(cardiomyopathies[MeSH] OR cardiomyopathy[tiab])",
  "Cardio-oncologia":
    '(cardiotoxicity[tiab] OR cardio-oncology[tiab] OR "cancer AND heart")',
  "Imagem Cardíaca":
    "(echocardiography[MeSH] OR cardiac imaging[tiab] OR cardiac MRI[tiab])",
  "Dispositivos / Eletrof.":
    "(defibrillators[MeSH] OR pacemaker[tiab] OR cardiac resynchronization[MeSH])",
  "Reabilitação Cardíaca":
    '(cardiac rehabilitation[MeSH] OR "cardiac rehab"[tiab])',
  "Síncope / Lipotímia": "(syncope[MeSH] OR presyncope[tiab])",
};

const FILTROS_BASE =
  ' AND (randomized controlled trial[pt] OR meta-analysis[pt] OR systematic review[pt] OR practice guideline[pt]) AND ("last 30 days"[PDat]) AND (humans[MeSH])';

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
    "delineamento": "Tipo exato do estudo (ex: ECRC duplo-cego, multicêntrico, placebo-controlado)",
    "populacao": {
      "descricao": "Descrição detalhada: critérios de inclusão/exclusão relevantes, condição clínica exata, gravidade, comorbidades",
      "n_total": "número total randomizado",
      "caracteristicas_basais": "Idade mediana/média, % mulheres, % com diabetes, FEVE, condições associadas relevantes — com números",
      "criterios_inclusao": "Principais critérios com detalhes numéricos (ex: NT-proBNP > X, LVEF ≤ X%)",
      "criterios_exclusao": "Principais critérios de exclusão"
    },
    "intervencao": "Droga/procedimento, dose exata, via, duração, quando iniciado em relação ao evento clínico",
    "comparador": "Placebo ou comparador ativo com detalhes",
    "desfecho_primario": "Definição exata do desfecho primário composto ou simples, com horizonte de tempo",
    "desfechos_secundarios": "Lista dos principais desfechos secundários com suas definições",
    "seguimento": "Duração e visitas de seguimento",
    "randomizacao": "Método, estratificação, razão de alocação",
    "analise_estatistica": "Teste primário, modelo usado, potência, taxa de evento esperada, alfa"
  },
  "resultados": {
    "desfecho_primario": {
      "grupo_intervencao": "n (%) que atingiram o desfecho",
      "grupo_controle": "n (%) que atingiram o desfecho",
      "estimativa": "HR/OR/RR com IC 95% e p-valor",
      "interpretacao": "O que esse resultado significa clinicamente"
    },
    "desfechos_secundarios": [
      {
        "nome": "Nome do desfecho",
        "resultado": "n (%), HR/OR/RR, IC 95%, p-valor",
        "interpretacao": "breve interpretação clínica"
      }
    ],
    "seguranca": {
      "eventos_adversos_principais": "Com incidências numéricas comparativas nos dois grupos",
      "descontinuacoes": "Taxa de descontinuação por eventos adversos"
    },
    "analises_pre_especificadas": "Subgrupos ou meta-análise pré-especificados com resultados numéricos"
  },
  "conclusao": {
    "conclusao_dos_autores": "O que os autores concluíram exatamente, incluindo a nuance entre o resultado principal e dados adicionais",
    "implicacao_clinica": "O que esse estudo muda ou não muda na prática clínica cardiológica",
    "limitacoes": "Limitações metodológicas relevantes mencionadas pelos autores",
    "contexto_evidencia": "Como esse resultado se encaixa no corpo de evidências existente (outros estudos mencionados)"
  },
  "titulo": "título completo em português",
  "journal": "nome do periódico",
  "ano": 2024,
  "tipo_estudo": "tipo exato identificado",
  "ferramentas_usadas": "lista das ferramentas aplicadas separadas por vírgula",
  "resumo_pt": "3-4 frases sintetizando o artigo para especialistas",
  "grade": "Alto, Moderado, Baixo ou Muito baixo",
  "grade_justificativa": "justificativa específica referenciando os domínios GRADE",
  "rob_resultado": "Baixo risco, Algumas preocupações ou Alto risco",
  "vieses_detalhados": "Para RCT — D1: [julgamento] — [justificativa]. D2-D5 idem. Para outros tipos — adaptar conforme ferramenta aplicada.",
  "jadad_score": null,
  "jadad_justificativa": "pontuação detalhada apenas se RCT",
  "amstar2_classificacao": null,
  "amstar2_justificativa": "apenas se revisão sistemática",
  "robis_resultado": null,
  "robis_justificativa": "apenas se revisão sistemática",
  "analise_metodologica": "avaliação crítica independente em 3-4 frases",
  "limitacoes_autores": "limitações declaradas pelos próprios autores",
  "conflitos_interesse": "conflitos de interesse e fonte de financiamento",
  "contexto_vs_anterior": "como este estudo muda, confirma ou contradiz a evidência prévia",
  "casp_resumo": "avaliação CASP resumida",
  "introducao_resumo": "contexto clínico e justificativa do estudo em 2-3 frases",
  "metodologia_detalhada": "desenho, população, intervenção, desfechos, seguimento, análise estatística — texto corrido detalhado",
  "resultados_principais": "desfecho primário com números, IC 95%, p-valor. Secundários relevantes. Eventos adversos. NNT/NNH.",
  "conclusao_autores": "conclusão declarada pelos autores",
  "implicacao_clinica": "impacto direto na prática clínica em 1-2 frases",
  "questao": "caso clínico de 2-3 frases baseado nos resultados",
  "alt_a": "", "alt_b": "", "alt_c": "", "alt_d": "",
  "resposta_correta": "A, B, C ou D",
  "feedback_quiz": "explicação da resposta com referência aos resultados e impacto clínico"
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

async function tentarPMC(
  pmid: string
): Promise<{
  texto: string;
  fonte: string;
  completo: boolean;
  url: string | null;
} | null> {
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
  `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/`,
  {
    headers: { "User-Agent": "MedUpdate/1.0 (medupdate@app.com)" },
    signal: AbortSignal.timeout(20000),
  }
);
if (!pmcResp.ok) return null;

const htmlBruto = await pmcResp.text();
const texto = htmlBruto
  .replace(/<script[\s\S]*?<\/script>/gi, "")
  .replace(/<style[\s\S]*?<\/style>/gi, "")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s{3,}/g, "\n\n")
  .trim();

if (texto.length > 3000) {
  return {
    texto: texto.substring(0, 30000),
    fonte: "PubMed Central",
    completo: true,
    url: `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/`,
  };
}
    }
  } catch (e) {
    console.log(`[PMC] Erro: ${e}`);
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let temasSolicitados: string[];

  try {
    const body = await req.json().catch(() => ({}));
    if (body.tema && TEMAS_QUERIES[body.tema]) {
      temasSolicitados = [body.tema];
    } else {
      temasSolicitados = Object.keys(TEMAS_QUERIES);
    }
  } catch {
    temasSolicitados = Object.keys(TEMAS_QUERIES);
  }

  const resultado = {
    processados: 0,
    pulados: 0,
    erros: [] as string[],
    temas_processados: [] as string[],
  };

  for (const tema of temasSolicitados) {
    const queryTema = TEMAS_QUERIES[tema];
    const fullQuery = queryTema + FILTROS_BASE;
    const maxArticles = temasSolicitados.length === 1 ? 5 : 1;

    console.log(`[TEMA] ${tema} — retmax=${maxArticles}`);

    try {
      const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(fullQuery)}&retmax=${maxArticles}&retmode=json&sort=date`;
      const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(15000) });
      if (!searchRes.ok) {
        resultado.erros.push(`PubMed search failed for ${tema}: ${searchRes.status}`);
        continue;
      }
      const searchData = await searchRes.json();
      const pmids: string[] = searchData?.esearchresult?.idlist ?? [];

      if (pmids.length === 0) {
        console.log(`[TEMA] ${tema}: nenhum PMID`);
        continue;
      }

      for (const pmid of pmids) {
        try {
          const { data: existing } = await supabase
            .from("artigos")
            .select("id")
            .eq("pmid", pmid)
            .maybeSingle();
          if (existing) {
            resultado.pulados++;
            continue;
          }

          const efetchResp = await fetch(
            `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&retmode=xml&email=medupdate@app.com`,
            { signal: AbortSignal.timeout(15000) }
          );
          if (!efetchResp.ok) {
            resultado.erros.push(`EFetch failed for ${pmid}: ${efetchResp.status}`);
            continue;
          }
          const xml = await efetchResp.text();

          const titulo = xml.match(/<ArticleTitle>([^<]+)<\/ArticleTitle>/)?.[1]?.trim() || "";
          const journal =
            xml.match(/<ISOAbbreviation>([^<]+)<\/ISOAbbreviation>/)?.[1]?.trim() ||
            xml.match(/<Title>([^<]+)<\/Title>/)?.[1]?.trim() || "";
          const ano = parseInt(xml.match(/<PubDate>[\s\S]*?<Year>(\d{4})<\/Year>/)?.[1] || "0");
          const doi = xml.match(/<ArticleId IdType="doi">([^<]+)<\/ArticleId>/)?.[1]?.trim();

          const abstractBlocos = [...xml.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g)];
          const abstractText = abstractBlocos
            .map((b) => b[1].replace(/<[^>]+>/g, "").trim())
            .filter((t) => t.length > 0)
            .join("\n\n")
            .trim();

          if (!abstractText || abstractText.length < 50) {
            resultado.erros.push(`Abstract too short for ${pmid}`);
            continue;
          }

          const pmcResult = await tentarPMC(pmid);
          const temTextoCompleto = !!pmcResult;
          const textoParaAnalise = pmcResult ? pmcResult.texto : abstractText;
          const fonteUsada = pmcResult ? pmcResult.fonte : "abstract";
          const urlUsada = pmcResult ? pmcResult.url : null;

          console.log(`[${tema}] PMID ${pmid}: fonte=${fonteUsada}, chars=${textoParaAnalise.length}`);

          const promptAnalise = buildPrompt(textoParaAnalise, fonteUsada, temTextoCompleto);

          const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "x-api-key": ANTHROPIC_API_KEY,
              "anthropic-version": "2023-06-01",
              "content-type": "application/json",
            },
            body: JSON.stringify({
              model: "claude-sonnet-4-20250514",
              max_tokens: 8000,
              messages: [{ role: "user", content: promptAnalise }],
            }),
            signal: AbortSignal.timeout(120000),
          });

          if (!claudeRes.ok) {
            const errText = await claudeRes.text();
            resultado.erros.push(`Claude error for ${pmid}: ${claudeRes.status} ${errText.substring(0, 200)}`);
            continue;
          }

          const claudeData = await claudeRes.json();
          const rawContent = claudeData?.content?.[0]?.text ?? "";
          const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            resultado.erros.push(`No JSON from Claude for ${pmid}`);
            continue;
          }

          const parsed = JSON.parse(jsonMatch[0]);
          const anoFinal = parsed.ano || ano || new Date().getFullYear();
          const linkFinal = urlUsada || (doi ? `https://doi.org/${doi}` : `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`);

          const insertPayload = buildInsertPayload(parsed, {
            especialidade_tema: tema,
            pmid,
            link_original: linkFinal,
            citacoes: 0,
            score_relevancia: (anoFinal - 2020) * 10 + 50,
            tem_texto_completo: temTextoCompleto,
            url_texto_completo: urlUsada,
            fonte_texto: fonteUsada,
            data_publicacao: anoFinal ? `${anoFinal}-01-01` : null,
            periodo_feed: "semanal",
            data_entrada_feed: new Date().toISOString(),
          });

          const { error: insertErr } = await supabase.from("artigos").insert(insertPayload);

          if (insertErr) {
            resultado.erros.push(`DB error for ${pmid}: ${insertErr.message}`);
            continue;
          }
          resultado.processados++;
          resultado.temas_processados.push(tema);
          console.log(`[✓] ${tema} — PMID ${pmid} salvo`);
        } catch (e) {
          resultado.erros.push(`Error ${pmid}: ${(e as Error).message}`);
        }
      }
    } catch (e) {
      resultado.erros.push(`Theme ${tema} failed: ${(e as Error).message}`);
    }
  }

  console.log(`[FIM] Processados: ${resultado.processados}, Pulados: ${resultado.pulados}, Erros: ${resultado.erros.length}`);

  return new Response(JSON.stringify(resultado), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
