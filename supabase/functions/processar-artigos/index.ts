import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// OBTENÇÃO DE TEXTO COMPLETO — com logging detalhado
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function identificarPublisher(url: string): string {
  if (url.includes('nature.com')) return 'Nature Portfolio';
  if (url.includes('nejm.org')) return 'NEJM';
  if (url.includes('thelancet.com')) return 'The Lancet';
  if (url.includes('jamanetwork.com')) return 'JAMA Network';
  if (url.includes('bmj.com')) return 'BMJ';
  if (url.includes('ahajournals.org')) return 'AHA Journals';
  if (url.includes('wiley.com') || url.includes('onlinelibrary')) return 'Wiley';
  if (url.includes('europepmc.org')) return 'Europe PMC';
  if (url.includes('frontiersin.org')) return 'Frontiers';
  if (url.includes('mdpi.com')) return 'MDPI';
  if (url.includes('plos')) return 'PLOS';
  if (url.includes('doi.org')) return 'Publisher';
  return 'Texto completo';
}

async function buscarTextoHTML(url: string): Promise<string | null> {
  try {
    console.log(`[HTML] Fazendo fetch: ${url}`);
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });

    console.log(`[HTML] Status: ${resp.status} | Content-Type: ${resp.headers.get('content-type')}`);
    if (!resp.ok) { await resp.body?.cancel(); return null; }

    const ct = resp.headers.get('content-type') || '';
    if (ct.includes('pdf')) {
      console.log(`[HTML] É PDF — ignorando`);
      await resp.body?.cancel();
      return null;
    }

    const html = await resp.text();
    console.log(`[HTML] HTML recebido: ${html.length} chars`);

    const texto = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<aside[\s\S]*?<\/aside>/gi, '')
      .replace(/<figure[\s\S]*?<\/figure>/gi, '')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s{3,}/g, '\n\n')
      .trim();

    console.log(`[HTML] Texto extraído: ${texto.length} chars`);
    if (texto.length < 3000) {
      console.log(`[HTML] Texto muito curto (< 3000) — provável paywall ou apenas abstract`);
      return null;
    }
    return texto.substring(0, 12000);
  } catch (e) {
    console.log(`[HTML] Erro: ${e}`);
    return null;
  }
}

interface TextoCompletoResult {
  texto: string;
  fonte: string;
  completo: boolean;
  url: string | null;
}

async function obterTextoCompleto(pmid: string, abstractText: string): Promise<TextoCompletoResult> {
  console.log(`[TEXTO-COMPLETO] Iniciando para PMID: ${pmid}`);

  // ─── FONTE 1: PMC via API de conversão de IDs ───────────────────
  try {
    console.log(`[PMC] Buscando PMCID para PMID ${pmid}`);
    const idConvResp = await fetch(
      `https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/?ids=${pmid}&format=json&email=medupdate@app.com`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (idConvResp.ok) {
      const idConvData = await idConvResp.json();
      const pmcid = idConvData?.records?.[0]?.pmcid;
      console.log(`[PMC] PMCID encontrado: ${pmcid || 'nenhum'}`);

      if (pmcid) {
        const pmcResp = await fetch(
          `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=${pmcid}&retmode=text&rettype=fulltext&email=medupdate@app.com`,
          { signal: AbortSignal.timeout(15000) }
        );
        const texto = await pmcResp.text();
        console.log(`[PMC] Texto recebido: ${texto.length} chars`);
        if (texto.length > 3000) {
          console.log(`[PMC] ✓ Texto completo via PMC`);
          return {
            texto: texto.substring(0, 12000),
            fonte: 'PubMed Central',
            completo: true,
            url: `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/`,
          };
        }
      }
    } else {
      console.log(`[PMC] idconv status: ${idConvResp.status}`);
      await idConvResp.body?.cancel();
    }
  } catch (e) {
    console.log(`[PMC] Erro: ${e}`);
  }

  // ─── FONTE 2: ELink — links gratuitos do publisher ──────────────
  try {
    console.log(`[ELINK] Buscando links gratuitos para PMID ${pmid}`);
    const elinkResp = await fetch(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/elink.fcgi?dbfrom=pubmed&id=${pmid}&cmd=llinks&retmode=xml&email=medupdate@app.com`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (elinkResp.ok) {
      const xmlRaw = await elinkResp.text();
      console.log(`[ELINK] XML recebido: ${xmlRaw.length} chars`);
      console.log(`[ELINK] Preview XML: ${xmlRaw.substring(0, 500)}`);

      const linksGratuitos: string[] = [];
      const blocos = xmlRaw.match(/<ObjUrl>[\s\S]*?<\/ObjUrl>/gi) || [];
      console.log(`[ELINK] Blocos ObjUrl encontrados: ${blocos.length}`);

      for (const bloco of blocos) {
        const urlMatch = bloco.match(/<Url><!\[CDATA\[([^\]]+)\]\]><\/Url>|<Url>([^<]+)<\/Url>/);
        if (!urlMatch) continue;
        const url = (urlMatch[1] || urlMatch[2] || '').trim()
          .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

        const atributos = (bloco.match(/<Attribute>[\s\S]*?<\/Attribute>/gi) || [])
          .map(a => a.replace(/<\/?Attribute>/gi, '').toLowerCase().trim());

        console.log(`[ELINK] URL: ${url} | Atributos: ${atributos.join(', ')}`);

        const livre = atributos.some(a =>
          a.includes('free') ||
          a.includes('open access') ||
          a.includes('full-text online') ||
          a.includes('full text online') ||
          a.includes('freely available')
        );
        const pago = atributos.some(a =>
          a.includes('subscription') ||
          a.includes('fee required') ||
          a.includes('membership')
        );

        if (livre && !pago) {
          console.log(`[ELINK] ✓ Link gratuito: ${url}`);
          linksGratuitos.push(url);
        }
      }

      console.log(`[ELINK] Total links gratuitos: ${linksGratuitos.length}`);

      for (const url of linksGratuitos) {
        console.log(`[FETCH] Tentando: ${url}`);
        const texto = await buscarTextoHTML(url);
        if (texto) {
          console.log(`[FETCH] ✓ Texto completo obtido: ${texto.length} chars de ${url}`);
          return { texto, fonte: identificarPublisher(url), completo: true, url };
        } else {
          console.log(`[FETCH] ✗ Falhou para: ${url}`);
        }
      }
    } else {
      console.log(`[ELINK] Status: ${elinkResp.status}`);
      await elinkResp.body?.cancel();
    }
  } catch (e) {
    console.log(`[ELINK] Erro: ${e}`);
  }

  // ─── FONTE 3: DOI direto via doi.org ────────────────────────────
  try {
    console.log(`[DOI] Buscando DOI para PMID ${pmid}`);
    const efetchResp = await fetch(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&retmode=xml&email=medupdate@app.com`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (efetchResp.ok) {
      const xmlPubmed = await efetchResp.text();
      const doiMatch = xmlPubmed.match(/<ArticleId IdType="doi">([^<]+)<\/ArticleId>/);
      const doi = doiMatch?.[1]?.trim();
      console.log(`[DOI] DOI encontrado: ${doi || 'nenhum'}`);

      if (doi) {
        const doiUrl = `https://doi.org/${doi}`;
        console.log(`[DOI] Tentando via doi.org: ${doiUrl}`);
        const texto = await buscarTextoHTML(doiUrl);
        if (texto) {
          console.log(`[DOI] ✓ Texto completo via DOI`);
          return { texto, fonte: identificarPublisher(doiUrl), completo: true, url: doiUrl };
        }
      }
    } else {
      await efetchResp.body?.cancel();
    }
  } catch (e) {
    console.log(`[DOI] Erro: ${e}`);
  }

  // ─── FALLBACK: abstract ──────────────────────────────────────────
  console.log(`[FALLBACK] Usando abstract (${abstractText.length} chars)`);
  return { texto: abstractText, fonte: 'abstract', completo: false, url: null };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HANDLER PRINCIPAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const resultado = { processados: 0, pulados: 0, erros: [] as string[] };

  try {
    const searchUrl = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=cardiology[MeSH]+AND+randomized+controlled+trial[pt]&retmax=5&retmode=json&sort=date";
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) throw new Error(`PubMed search failed: ${searchRes.status}`);
    const searchData = await searchRes.json();
    const pmids: string[] = searchData?.esearchresult?.idlist ?? [];

    if (pmids.length === 0) {
      return new Response(JSON.stringify({ ...resultado, message: "Nenhum PMID encontrado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    for (const pmid of pmids) {
      try {
        const { data: existing } = await supabase.from("artigos").select("id").eq("pmid", pmid).maybeSingle();
        if (existing) { resultado.pulados++; continue; }

        const abstractRes = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&retmode=text&rettype=abstract`);
        if (!abstractRes.ok) { resultado.erros.push(`Fetch abstract failed for ${pmid}: ${abstractRes.status}`); continue; }
        const abstractText = await abstractRes.text();
        if (!abstractText || abstractText.trim().length < 50) { resultado.erros.push(`Abstract too short for ${pmid}`); continue; }

        // Obter texto completo via ELink + PMC + HTML
        const fullText = await obterTextoCompleto(pmid, abstractText);
        console.log(`PMID ${pmid}: fonte=${fullText.fonte}, completo=${fullText.completo}, chars=${fullText.texto.length}`);

        let instrucaoExtra: string;
        if (fullText.completo) {
          instrucaoExtra = `Você tem acesso ao TEXTO COMPLETO deste artigo (fonte: ${fullText.fonte}).
Analise com profundidade máxima, usando informações específicas do texto. Inclua no JSON:
- analise_metodologica: método de randomização, cegamento, ITT, tamanho amostral, poder estatístico
- vieses_detalhados: avaliação por domínio RoB 2 com julgamento e justificativa específica para cada domínio
- limitacoes_autores: limitações declaradas pelos próprios autores
- conflitos_interesse: conflitos e financiamento reportados

Texto completo (${fullText.texto.length} chars):
${fullText.texto}`;
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
            messages: [{ role: "user", content: `Você é especialista em epidemiologia clínica. ${instrucaoExtra}\n\nAnalise este artigo médico e retorne SOMENTE um JSON válido, sem texto antes ou depois, sem markdown:\n{\n  "titulo": "título em português",\n  "journal": "nome do journal",\n  "ano": 2024,\n  "resumo_pt": "3 frases em português para médicos especialistas",\n  "tipo_estudo": "tipo do estudo",\n  "grade": "Alto, Moderado, Baixo ou Muito baixo",\n  "grade_justificativa": "uma frase",\n  "rob_resultado": "Baixo risco, Algumas preocupações ou Alto risco",\n  "analise_metodologica": "3-4 frases sobre metodologia",\n  "contexto_vs_anterior": "como este artigo se relaciona com o que já se sabia",\n  "vieses_detalhados": "lista detalhada dos vieses identificados por domínio RoB 2",\n  "limitacoes_autores": "limitações declaradas pelos próprios autores do artigo",\n  "conflitos_interesse": "conflitos de interesse reportados no artigo",\n  "questao": "caso clínico de 2-3 frases para quiz",\n  "alt_a": "alternativa A",\n  "alt_b": "alternativa B",\n  "alt_c": "alternativa C",\n  "alt_d": "alternativa D",\n  "resposta_correta": "A, B, C ou D",\n  "feedback_quiz": "2-3 frases explicando a resposta correta"\n}\n\nArtigo:\n${fullText.texto}` }],
          }),
        });

        if (!claudeRes.ok) {
          const errText = await claudeRes.text();
          resultado.erros.push(`Claude API error for ${pmid} [${claudeRes.status}]: ${errText}`);
          continue;
        }

        const claudeData = await claudeRes.json();
        const rawContent = claudeData?.content?.[0]?.text ?? "";

        let parsed: Record<string, any>;
        try {
          const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error("No JSON object found");
          parsed = JSON.parse(jsonMatch[0]);
        } catch (parseErr) {
          resultado.erros.push(`Invalid JSON from Claude for ${pmid}: ${(parseErr as Error).message}`);
          continue;
        }

        const ano = parsed.ano ?? new Date().getFullYear();

        const { error: insertErr } = await supabase.from("artigos").insert({
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
          tem_texto_completo: fullText.completo,
          url_texto_completo: fullText.url,
          fonte_texto: fullText.fonte,
          data_publicacao: new Date().toISOString().split('T')[0],
        });

        if (insertErr) { resultado.erros.push(`DB insert error for ${pmid}: ${insertErr.message}`); continue; }
        resultado.processados++;
      } catch (e) {
        resultado.erros.push(`Unexpected error for ${pmid}: ${(e as Error).message}`);
      }
    }

    return new Response(JSON.stringify(resultado),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
