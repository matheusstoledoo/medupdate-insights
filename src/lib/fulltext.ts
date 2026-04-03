export interface TextoCompletoResult {
  texto: string;
  fonte: string;
  completo: boolean;
  url: string | null;
}

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
  return 'Texto completo';
}

function extrairTextoDeHTML(html: string): string {
  return html
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
}

export async function buscarTextoCompletoNoFrontend(
  pmid: string,
  onStatus?: (msg: string) => void
): Promise<TextoCompletoResult> {
  const status = onStatus || (() => {});

  // PASSO 1 — PMC (funciona tanto do browser quanto do servidor)
  status('Verificando disponibilidade de texto completo...');
  try {
    const idConvResp = await fetch(
      `https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/?ids=${pmid}&format=json&email=medupdate@app.com`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (idConvResp.ok) {
      const idConvData = await idConvResp.json();
      const pmcid = idConvData?.records?.[0]?.pmcid;
      if (pmcid) {
        const pmcResp = await fetch(
          `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=${pmcid}&retmode=text&rettype=fulltext&email=medupdate@app.com`,
          { signal: AbortSignal.timeout(15000) }
        );
        if (pmcResp.ok) {
          const texto = await pmcResp.text();
          if (texto.length > 3000) {
            return {
              texto: texto.substring(0, 12000),
              fonte: 'PubMed Central',
              completo: true,
              url: `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/`,
            };
          }
        }
      }
    }
  } catch (e) {
    console.log('[PMC] Erro:', e);
  }

  // PASSO 2 — ELink: buscar links gratuitos
  status('Acessando artigo no publisher...');
  try {
    const elinkResp = await fetch(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/elink.fcgi?dbfrom=pubmed&id=${pmid}&cmd=llinkslib&retmode=xml&email=medupdate@app.com`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (elinkResp.ok) {
      const xml = await elinkResp.text();
      const blocos = xml.match(/<ObjUrl>[\s\S]*?<\/ObjUrl>/gi) || [];
      const linksGratuitos: string[] = [];

      for (const bloco of blocos) {
        const urlMatch = bloco.match(
          /<Url><!\[CDATA\[([^\]]+)\]\]><\/Url>|<Url>([^<]+)<\/Url>/
        );
        if (!urlMatch) continue;
        const url = (urlMatch[1] || urlMatch[2] || '')
          .trim()
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>');

        const atributos = (bloco.match(/<Attribute>[\s\S]*?<\/Attribute>/gi) || [])
          .map(a => a.replace(/<\/?Attribute>/gi, '').toLowerCase())
          .join(' ');

        const livre =
          atributos.includes('free') ||
          atributos.includes('open access') ||
          atributos.includes('full-text online') ||
          atributos.includes('freely available');

        const pago =
          atributos.includes('subscription') ||
          atributos.includes('fee required') ||
          atributos.includes('membership');

        if (livre && !pago && url.startsWith('http')) {
          linksGratuitos.push(url);
        }
      }

      // PASSO 3 — Fetch no browser (não bloqueado por publishers)
      for (const url of linksGratuitos) {
        try {
          const resp = await fetch(url, {
            headers: {
              'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
            },
            signal: AbortSignal.timeout(15000),
          });

          if (!resp.ok) continue;

          const ct = resp.headers.get('content-type') || '';
          if (ct.includes('pdf')) continue;

          const html = await resp.text();
          const texto = extrairTextoDeHTML(html);

          if (texto.length > 3000) {
            return {
              texto: texto.substring(0, 12000),
              fonte: identificarPublisher(url),
              completo: true,
              url,
            };
          }
        } catch (e) {
          continue;
        }
      }
    }
  } catch (e) {
    console.log('[ELINK] Erro:', e);
  }

  // FALLBACK
  return { texto: '', fonte: 'abstract', completo: false, url: null };
}
