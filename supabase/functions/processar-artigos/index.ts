import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TEMAS_LISTA = [
  "Insuficiência Cardíaca",
  "Arritmias / FA",
  "Cardiopatia Isquêmica",
  "Hipertensão Arterial",
  "Valvopatias",
  "Cardiologia Preventiva",
  "Miocardiopatias",
  "Cardio-oncologia",
  "Imagem Cardíaca",
  "Dispositivos / Eletrof.",
  "Reabilitação Cardíaca",
  "Síncope / Lipotímia",
];

const TEMAS_QUERIES: Record<string, string> = {
  "Insuficiência Cardíaca":
    '(heart failure[MeSH Terms]) AND (treatment[tiab] OR therapy[tiab] OR management[tiab] OR outcomes[tiab] OR prognosis[tiab])',
  "Arritmias / FA":
    '(atrial fibrillation[MeSH Terms] OR arrhythmias, cardiac[MeSH Terms] OR ventricular tachycardia[MeSH Terms] OR atrial flutter[MeSH Terms])',
  "Cardiopatia Isquêmica":
    '(myocardial infarction[MeSH Terms] OR coronary artery disease[MeSH Terms] OR acute coronary syndrome[tiab] OR STEMI[tiab] OR NSTEMI[tiab] OR unstable angina[MeSH Terms])',
  "Hipertensão Arterial":
    '(hypertension[MeSH Terms]) AND (drug therapy[MeSH Subheading] OR treatment outcome[MeSH Terms] OR antihypertensive agents[MeSH Terms])',
  "Valvopatias":
    '(heart valve diseases[MeSH Terms] OR aortic valve stenosis[MeSH Terms] OR mitral valve insufficiency[MeSH Terms] OR TAVR[tiab] OR TAVI[tiab] OR transcatheter aortic valve[tiab])',
  "Cardiologia Preventiva":
    '(cardiovascular diseases[MeSH Terms]) AND (primary prevention[tiab] OR secondary prevention[tiab] OR cardiovascular risk[tiab] OR lipid-lowering[tiab] OR statins[tiab])',
  "Miocardiopatias":
    '(cardiomyopathies[MeSH Terms] OR hypertrophic cardiomyopathy[MeSH Terms] OR dilated cardiomyopathy[tiab] OR cardiac amyloidosis[tiab] OR ATTR[tiab])',
  "Cardio-oncologia":
    '(cardiotoxicity[tiab] OR cardio-oncology[tiab] OR cardiovascular complications[tiab]) AND (antineoplastic agents[MeSH Terms] OR immunotherapy[MeSH Terms] OR cancer[tiab])',
  "Imagem Cardíaca":
    '(echocardiography[MeSH Terms] OR cardiac magnetic resonance[tiab] OR cardiac MRI[tiab] OR cardiac CT[tiab] OR coronary computed tomography[tiab])',
  "Dispositivos / Eletrof.":
    '(defibrillators, implantable[MeSH Terms] OR cardiac resynchronization therapy[MeSH Terms] OR pacemaker, artificial[MeSH Terms] OR catheter ablation[MeSH Terms] OR subcutaneous ICD[tiab])',
  "Reabilitação Cardíaca":
    '(cardiac rehabilitation[MeSH Terms]) OR (exercise therapy[MeSH Terms] AND cardiovascular diseases[MeSH Terms])',
  "Síncope / Lipotímia":
    '(syncope[MeSH Terms] OR syncope, vasovagal[MeSH Terms] OR presyncope[tiab] OR orthostatic hypotension[MeSH Terms])',
};

const JOURNALS_ALTO_IMPACTO =
  '("N Engl J Med"[Journal] OR "Lancet"[Journal] OR "JAMA"[Journal] OR "Circulation"[Journal] OR "J Am Coll Cardiol"[Journal] OR "Eur Heart J"[Journal] OR "JAMA Cardiol"[Journal] OR "Heart"[Journal] OR "BMJ"[Journal])';

const FILTROS_BASE =
  ` AND (randomized controlled trial[pt] OR meta-analysis[pt] OR systematic review[pt] OR practice guideline[pt]) AND ("last 30 days"[PDat]) AND (humans[MeSH Terms]) AND ${JOURNALS_ALTO_IMPACTO}`;

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
      "caracteristicas_basais": "Idade, % mulheres, etc.",
      "criterios_inclusao": "Liste TODOS",
      "criterios_exclusao": "Liste TODOS"
    },
    "intervencao": "Droga/procedimento, dose exata",
    "comparador": "Placebo ou comparador ativo",
    "desfecho_primario": "Definição exata",
    "desfechos_secundarios": "Lista dos principais",
    "seguimento": "Duração",
    "randomizacao": "Método",
    "analise_estatistica": "Teste primário, modelo estatístico"
  },
  "resultados": {
    "desfecho_primario": {
      "grupo_intervencao": "n (%)",
      "grupo_controle": "n (%)",
      "estimativa": "HR/OR/RR com IC 95% e p-valor",
      "interpretacao": "Significado clínico"
    },
    "desfechos_secundarios": [
      { "nome": "", "resultado": "", "interpretacao": "" }
    ],
    "seguranca": {
      "eventos_adversos_principais": "",
      "descontinuacoes": ""
    },
    "analises_pre_especificadas": ""
  },
  "conclusao": {
    "conclusao_dos_autores": "",
    "implicacao_clinica": "",
    "limitacoes": "",
    "contexto_evidencia": ""
  },
  "titulo": "título completo em português",
  "journal": "nome do periódico",
  "ano": "ano de publicação",
  "tipo_estudo": "tipo exato identificado",
  "ferramentas_usadas": "lista das ferramentas aplicadas",
  "resumo_pt": "3-4 frases sintetizando o artigo",
  "grade": "Alto, Moderado, Baixo ou Muito baixo",
  "grade_justificativa": "justificativa específica",
  "rob_resultado": "Baixo risco, Algumas preocupações ou Alto risco",
  "vieses_detalhados": "Para RCT — D1-D5. Para outros — adaptar.",
  "jadad_score": null,
  "jadad_justificativa": "pontuação detalhada apenas se RCT",
  "amstar2_classificacao": null,
  "amstar2_justificativa": "apenas se revisão sistemática",
  "robis_resultado": null,
  "robis_justificativa": "apenas se revisão sistemática",
  "analise_metodologica": "avaliação crítica independente",
  "limitacoes_autores": "limitações declaradas",
  "conflitos_interesse": "conflitos e financiamento",
  "contexto_vs_anterior": "como muda a evidência prévia",
  "casp_resumo": "avaliação CASP resumida",
  "introducao_resumo": "Mínimo 150 palavras. Contexto epidemiológico, lacuna, hipótese",
  "metodologia_detalhada": "Mínimo 400 palavras. Delineamento completo",
  "resultados_principais": "Mínimo 300 palavras. Desfechos com números",
  "conclusao_autores": "Mínimo 150 palavras. Conclusão fiel dos autores",
  "implicacao_clinica": "Mínimo 150 palavras. Impacto na prática",
  "questao_1": {
    "enunciado": "Caso clínico de 2-3 frases",
    "alt_a": "", "alt_b": "", "alt_c": "", "alt_d": "",
    "resposta_correta": "C",
    "feedback": "Explicação com HR, IC 95%, p-valor"
  },
  "questao_2": {
    "enunciado": "Questão metodológica ou de segurança",
    "alt_a": "", "alt_b": "", "alt_c": "", "alt_d": "",
    "resposta_correta": "A, B, C ou D",
    "feedback": "Explicação com dado específico"
  },
  "questao_3": {
    "enunciado": "Questão sobre aplicação clínica",
    "alt_a": "", "alt_b": "", "alt_c": "", "alt_d": "",
    "resposta_correta": "A, B, C ou D",
    "feedback": "Explicação com dado específico"
  }
}

Texto do artigo (fonte: ${fonteUsada}, ${textoParaAnalise.length} chars):
${textoParaAnalise}`;
}

function buildInsertPayload(parsed: Record<string, any>, extras: Record<string, any>) {
  const analiseCompleta: Record<string, any> = {};
  if (parsed.metodologia) analiseCompleta.metodologia = parsed.metodologia;
  if (parsed.resultados) analiseCompleta.resultados = parsed.resultados;
  if (parsed.conclusao) analiseCompleta.conclusao = parsed.conclusao;
  if (parsed.questao_1) analiseCompleta.questao_1 = parsed.questao_1;
  if (parsed.questao_2) analiseCompleta.questao_2 = parsed.questao_2;
  if (parsed.questao_3) analiseCompleta.questao_3 = parsed.questao_3;

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
    questao: parsed.questao_1?.enunciado || parsed.questao || null,
    alt_a: parsed.questao_1?.alt_a || parsed.alt_a || null,
    alt_b: parsed.questao_1?.alt_b || parsed.alt_b || null,
    alt_c: parsed.questao_1?.alt_c || parsed.alt_c || null,
    alt_d: parsed.questao_1?.alt_d || parsed.alt_d || null,
    resposta_correta: parsed.questao_1?.resposta_correta || parsed.resposta_correta || null,
    feedback_quiz: parsed.questao_1?.feedback || parsed.feedback_quiz || null,
    analise_completa: Object.keys(analiseCompleta).length > 0 ? analiseCompleta : null,
    ...extras,
  };
}

async function tentarPMC(pmid: string): Promise<{
  texto: string; fonte: string; completo: boolean; url: string | null;
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
    let pmcTexto = htmlBruto
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<header[\s\S]*?<\/header>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      .replace(/<aside[\s\S]*?<\/aside>/gi, "");

    const articleMatch = pmcTexto.match(/<article[\s\S]*?<\/article>/i) ||
                         pmcTexto.match(/<main[\s\S]*?<\/main>/i) ||
                         pmcTexto.match(/id="(?:content|main-content|article-body)"[\s\S]*?<\/div>/i);

    if (articleMatch) {
      pmcTexto = articleMatch[0];
    }

    pmcTexto = pmcTexto
      .replace(/<[^>]+>/g, " ")
      .replace(/\s{3,}/g, "\n\n")
      .trim();

    if (pmcTexto.length > 3000) {
      return {
        texto: pmcTexto.substring(0, 30000),
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

async function getProximoTema(supabase: any): Promise<{ tema: string; proximoTema: string }> {
  const { data } = await supabase
    .from("controle_processamento")
    .select("valor")
    .eq("chave", "ultimo_tema_processado")
    .maybeSingle();

  const ultimoTema = data?.valor || null;
  let idx = 0;

  if (ultimoTema) {
    const lastIdx = TEMAS_LISTA.indexOf(ultimoTema);
    if (lastIdx !== -1) {
      idx = (lastIdx + 1) % TEMAS_LISTA.length;
    }
  }

  const tema = TEMAS_LISTA[idx];
  const proximoTema = TEMAS_LISTA[(idx + 1) % TEMAS_LISTA.length];
  return { tema, proximoTema };
}

async function salvarUltimoTema(supabase: any, tema: string) {
  await supabase
    .from("controle_processamento")
    .upsert(
      { chave: "ultimo_tema_processado", valor: tema, updated_at: new Date().toISOString() },
      { onConflict: "chave" }
    );
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

  let temaParaProcessar: string;
  let proximoTema: string;

  try {
    const body = await req.json().catch(() => ({}));
    if (body.tema && TEMAS_QUERIES[body.tema]) {
      temaParaProcessar = body.tema;
      const idx = TEMAS_LISTA.indexOf(body.tema);
      proximoTema = TEMAS_LISTA[(idx + 1) % TEMAS_LISTA.length];
    } else {
      const rotacao = await getProximoTema(supabase);
      temaParaProcessar = rotacao.tema;
      proximoTema = rotacao.proximoTema;
    }
  } catch {
    const rotacao = await getProximoTema(supabase);
    temaParaProcessar = rotacao.tema;
    proximoTema = rotacao.proximoTema;
  }

  const resultado = {
    tema_processado: temaParaProcessar,
    artigos_inseridos: 0,
    proximo_tema: proximoTema,
    erros: [] as string[],
    pulados: 0,
  };

  const queryTema = TEMAS_QUERIES[temaParaProcessar];
  const fullQuery = queryTema + FILTROS_BASE;
  const maxArticles = 3;

  console.log(`[TEMA] ${temaParaProcessar} — retmax=${maxArticles}`);

  try {
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(fullQuery)}&retmax=${maxArticles}&retmode=json&sort=date`;
    const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(15000) });
    if (!searchRes.ok) {
      resultado.erros.push(`PubMed search failed: ${searchRes.status}`);
      return new Response(JSON.stringify(resultado), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const searchData = await searchRes.json();
    const pmids: string[] = searchData?.esearchresult?.idlist ?? [];

    if (pmids.length === 0) {
      console.log(`[TEMA] ${temaParaProcessar}: nenhum PMID`);
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

        console.log(`[${temaParaProcessar}] PMID ${pmid}: fonte=${fonteUsada}, chars=${textoParaAnalise.length}`);

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
            max_tokens: 10000,
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
        console.log(`[PARSE] Chaves retornadas pelo Claude: ${Object.keys(parsed).join(', ')}`);
        console.log(`[PARSE] questao_1 existe: ${!!parsed.questao_1}`);

        const anoFinal = parsed.ano || ano || new Date().getFullYear();
        const linkFinal = urlUsada || (doi ? `https://doi.org/${doi}` : `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`);

        const insertPayload = buildInsertPayload(parsed, {
          especialidade_tema: temaParaProcessar,
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
        resultado.artigos_inseridos++;
        console.log(`[✓] ${temaParaProcessar} — PMID ${pmid} salvo`);
      } catch (e) {
        resultado.erros.push(`Error ${pmid}: ${(e as Error).message}`);
      }
    }
  } catch (e) {
    resultado.erros.push(`Theme failed: ${(e as Error).message}`);
  }

  // Salvar último tema processado
  await salvarUltimoTema(supabase, temaParaProcessar);

  console.log(`[FIM] Tema: ${temaParaProcessar}, Inseridos: ${resultado.artigos_inseridos}, Pulados: ${resultado.pulados}, Erros: ${resultado.erros.length}`);

  return new Response(JSON.stringify(resultado), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
