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
  ' AND (randomized controlled trial[pt] OR meta-analysis[pt] OR systematic review[pt] OR practice guideline[pt]) AND ("last 12 months"[PDat]) AND (humans[MeSH])';

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
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=${pmcid}&retmode=text&rettype=fulltext&email=medupdate@app.com`,
      { signal: AbortSignal.timeout(15000) }
    );
    const texto = await pmcResp.text();
    if (texto.length > 3000) {
      return {
        texto: texto.substring(0, 12000),
        fonte: "PubMed Central",
        completo: true,
        url: `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/`,
      };
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
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
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
      // Process all themes, 1 article each
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
      const searchRes = await fetch(searchUrl, {
        signal: AbortSignal.timeout(15000),
      });
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

          // Fetch metadata via efetch XML
          const efetchResp = await fetch(
            `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&retmode=xml&email=medupdate@app.com`,
            { signal: AbortSignal.timeout(15000) }
          );
          if (!efetchResp.ok) {
            resultado.erros.push(`EFetch failed for ${pmid}: ${efetchResp.status}`);
            continue;
          }
          const xml = await efetchResp.text();

          const titulo =
            xml.match(/<ArticleTitle>([^<]+)<\/ArticleTitle>/)?.[1]?.trim() || "";
          const journal =
            xml
              .match(/<ISOAbbreviation>([^<]+)<\/ISOAbbreviation>/)?.[1]
              ?.trim() ||
            xml.match(/<Title>([^<]+)<\/Title>/)?.[1]?.trim() ||
            "";
          const ano = parseInt(
            xml.match(/<PubDate>[\s\S]*?<Year>(\d{4})<\/Year>/)?.[1] || "0"
          );
          const doi = xml
            .match(/<ArticleId IdType="doi">([^<]+)<\/ArticleId>/)?.[1]
            ?.trim();

          const abstractBlocos = [
            ...xml.matchAll(
              /<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g
            ),
          ];
          const abstractText = abstractBlocos
            .map((b) => b[1].replace(/<[^>]+>/g, "").trim())
            .filter((t) => t.length > 0)
            .join("\n\n")
            .trim();

          if (!abstractText || abstractText.length < 50) {
            resultado.erros.push(`Abstract too short for ${pmid}`);
            continue;
          }

          // Try PMC full text
          const pmcResult = await tentarPMC(pmid);
          const temTextoCompleto = !!pmcResult;
          const textoParaAnalise = pmcResult
            ? pmcResult.texto
            : abstractText;
          const fonteUsada = pmcResult ? pmcResult.fonte : "abstract";
          const urlUsada = pmcResult ? pmcResult.url : null;

          console.log(
            `[${tema}] PMID ${pmid}: fonte=${fonteUsada}, chars=${textoParaAnalise.length}`
          );

          const instrucaoExtra = temTextoCompleto
            ? `Você tem o TEXTO COMPLETO deste artigo (fonte: ${fonteUsada}). Faça análise metodológica DETALHADA.`
            : `Você tem apenas o ABSTRACT. Faça a melhor análise possível. Indique nos campos vieses_detalhados e limitacoes_autores quando não foi possível avaliar.`;

          const claudeRes = await fetch(
            "https://api.anthropic.com/v1/messages",
            {
              method: "POST",
              headers: {
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
              },
              body: JSON.stringify({
                model: "claude-sonnet-4-20250514",
                max_tokens: 2500,
                messages: [
                  {
                    role: "user",
                    content: `${instrucaoExtra}\n\nRetorne SOMENTE um JSON válido:\n{\n"titulo":"título em português",\n"journal":"nome do journal",\n"ano":2024,\n"resumo_pt":"3-4 frases em português para especialistas",\n"tipo_estudo":"tipo do estudo",\n"grade":"Alto, Moderado, Baixo ou Muito baixo",\n"grade_justificativa":"uma frase",\n"rob_resultado":"Baixo risco, Algumas preocupações ou Alto risco",\n"analise_metodologica":"4-5 frases detalhadas",\n"vieses_detalhados":"avaliação por domínio RoB 2",\n"limitacoes_autores":"limitações declaradas pelos autores",\n"conflitos_interesse":"conflitos e financiamento",\n"contexto_vs_anterior":"relação com evidência anterior",\n"questao":"caso clínico 2-3 frases",\n"alt_a":"","alt_b":"","alt_c":"","alt_d":"",\n"resposta_correta":"A, B, C ou D",\n"feedback_quiz":"2-3 frases com impacto clínico"\n}\n\nArtigo (${fonteUsada}, ${textoParaAnalise.length} chars):\n${textoParaAnalise}`,
                  },
                ],
              }),
              signal: AbortSignal.timeout(60000),
            }
          );

          if (!claudeRes.ok) {
            const errText = await claudeRes.text();
            resultado.erros.push(
              `Claude error for ${pmid}: ${claudeRes.status} ${errText.substring(0, 200)}`
            );
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
          const linkFinal =
            urlUsada ||
            (doi
              ? `https://doi.org/${doi}`
              : `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`);

          const { error: insertErr } = await supabase.from("artigos").insert({
            titulo: parsed.titulo || titulo || `Artigo ${pmid}`,
            journal: parsed.journal || journal || null,
            ano: anoFinal,
            especialidade: "Cardiologia",
            especialidade_tema: tema,
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
            link_original: linkFinal,
            citacoes: 0,
            score_relevancia: (anoFinal - 2020) * 10 + 50,
            tem_texto_completo: temTextoCompleto,
            url_texto_completo: urlUsada,
            fonte_texto: fonteUsada,
            data_publicacao: anoFinal ? `${anoFinal}-01-01` : null,
          });

          if (insertErr) {
            resultado.erros.push(`DB error for ${pmid}: ${insertErr.message}`);
            continue;
          }
          resultado.processados++;
          resultado.temas_processados.push(tema);
          console.log(`[✓] ${tema} — PMID ${pmid} salvo`);
        } catch (e) {
          resultado.erros.push(
            `Error ${pmid}: ${(e as Error).message}`
          );
        }
      }
    } catch (e) {
      resultado.erros.push(`Theme ${tema} failed: ${(e as Error).message}`);
    }
  }

  console.log(
    `[FIM] Processados: ${resultado.processados}, Pulados: ${resultado.pulados}, Erros: ${resultado.erros.length}`
  );

  return new Response(JSON.stringify(resultado), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
