export function abrirLinkExterno(url: string | null | undefined): void {
  if (!url) return;
  const urlFinal = url.startsWith('http') ? url : `https://${url}`;
  const link = document.createElement('a');
  link.href = urlFinal;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => { if (document.body.contains(link)) document.body.removeChild(link); }, 200);
}

export function getLinkArtigo(artigo: {
  tem_texto_completo?: boolean;
  url_texto_completo?: string | null;
  link_original?: string | null;
  pmid?: string | null;
}): string {
  if (artigo.tem_texto_completo && artigo.url_texto_completo) return artigo.url_texto_completo;
  if (artigo.link_original) return artigo.link_original;
  if (artigo.pmid) return `https://pubmed.ncbi.nlm.nih.gov/${artigo.pmid}/`;
  return '';
}

export function getLabelLinkArtigo(artigo: {
  tem_texto_completo?: boolean;
  fonte_texto?: string | null;
}): string {
  if (artigo.tem_texto_completo) return `Ver texto completo (${artigo.fonte_texto || 'acesso aberto'}) ↗`;
  return 'Ver no PubMed ↗';
}

export interface ResultadoTextoCompleto {
  texto: string;
  fonte: string;
  completo: boolean;
  url: string | null;
  motivo?: string;
}

export async function buscarTextoCompletoNoFrontend(
  pmid: string,
  onStatus?: (msg: string) => void
): Promise<ResultadoTextoCompleto> {
  const log = (msg: string) => { console.log(`[FRONTEND] ${msg}`); onStatus?.(msg); };

  log('Verificando PubMed Central...');
  try {
    const idConvResp = await fetch(`https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/?ids=${pmid}&format=json&email=medupdate@app.com`);
    const idConvData = await idConvResp.json();
    const pmcid = idConvData.records?.[0]?.pmcid;
    if (pmcid) {
      log(`PMC encontrado: ${pmcid} — baixando...`);
      const pmcResp = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=${pmcid}&retmode=text&rettype=fulltext&email=medupdate@app.com`);
      if (pmcResp.ok) {
        const texto = await pmcResp.text();
        if (texto.length > 3000) {
          log(`✓ Texto completo via PMC (${texto.length} chars)`);
          return { texto: texto.substring(0, 12000), fonte: 'PubMed Central', completo: true, url: `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/` };
        }
      }
    }
  } catch (e) { log(`PMC indisponível: ${e}`); }

  log('Buscando links de acesso aberto...');
  try {
    const elinkResp = await fetch(
      'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/elink.fcgi?dbfrom=pubmed&id=' +
      pmid + '&cmd=llinkslib&retmode=xml&email=medupdate@app.com'
    );
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
      if (!url.startsWith('http')) continue;

      const atributos = (
        bloco.match(/<Attribute>[\s\S]*?<\/Attribute>/gi) || []
      ).map(a => a.replace(/<\/?Attribute>/gi, '').toLowerCase());

      const livre = atributos.some(
        a =>
          a.includes('free') ||
          a.includes('open access') ||
          a.includes('full-text online') ||
          a.includes('freely available')
      );
      const pago = atributos.some(
        a =>
          a.includes('subscription') ||
          a.includes('fee required') ||
          a.includes('membership')
      );
      if (livre && !pago) linksGratuitos.push(url);
    }

    for (const urlOriginal of linksGratuitos) {
      // Se a URL é de PDF, tentar converter para página HTML
      const urlsParaTentar = [urlOriginal];

      const ehUrlPDF =
        urlOriginal.includes('pdfdirect') ||
        urlOriginal.includes('/pdf/') ||
        urlOriginal.endsWith('.pdf');

      if (ehUrlPDF) {
        // Wiley: /doi/pdfdirect/X → /doi/full/X ou /doi/abs/X
        const wileyHtml = urlOriginal
          .replace('/pdfdirect/', '/full/')
          .replace('/pdf/', '/full/');
        if (wileyHtml !== urlOriginal) urlsParaTentar.unshift(wileyHtml);

        // Oxford: remover /pdf do path
        const oxfordHtml = urlOriginal.replace(/\/pdf(\/|$)/, '/');
        if (oxfordHtml !== urlOriginal) urlsParaTentar.unshift(oxfordHtml);

        log('URL de PDF detectada — tentando versão HTML primeiro');
      }

      for (const url of urlsParaTentar) {
        log('Acessando ' + url + '...');
        try {
          const resp = await fetch(url, {
            headers: {
              Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
            },
            signal: AbortSignal.timeout(15000),
          });

          if (!resp.ok) continue;

          const ct = resp.headers.get('content-type') || '';
          if (ct.includes('pdf')) {
            log('Resposta é PDF — pulando');
            continue;
          }

          const html = await resp.text();
          const texto = html
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<nav[\s\S]*?<\/nav>/gi, '')
            .replace(/<header[\s\S]*?<\/header>/gi, '')
            .replace(/<footer[\s\S]*?<\/footer>/gi, '')
            .replace(/<aside[\s\S]*?<\/aside>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/\s{3,}/g, '\n\n')
            .trim();

          if (texto.length > 3000) {
            let fonte = 'Texto completo';
            if (url.includes('nature.com')) fonte = 'Nature Portfolio';
            else if (url.includes('nejm.org')) fonte = 'NEJM';
            else if (url.includes('thelancet.com')) fonte = 'The Lancet';
            else if (url.includes('jamanetwork.com')) fonte = 'JAMA Network';
            else if (url.includes('bmj.com')) fonte = 'BMJ';
            else if (url.includes('ahajournals.org')) fonte = 'AHA Journals';
            else if (
              url.includes('wiley.com') ||
              url.includes('onlinelibrary')
            )
              fonte = 'Wiley';
            else if (url.includes('academic.oup.com')) fonte = 'Oxford Academic';
            else if (url.includes('frontiersin.org')) fonte = 'Frontiers';
            else if (url.includes('mdpi.com')) fonte = 'MDPI';
            else if (url.includes('plos')) fonte = 'PLOS';
            else if (url.includes('hal.science')) fonte = 'HAL';
            log('✓ Texto completo via ' + fonte + ' (' + texto.length + ' chars)');
            return {
              texto: texto.substring(0, 12000),
              fonte,
              completo: true,
              url,
            };
          } else {
            log('Texto insuficiente (' + texto.length + ' chars) — possível paywall');
          }
        } catch (e) {
          log('Falhou ' + url + ': ' + e);
        }
      }
    }
  } catch (e) {
    log('ELink falhou: ' + e);
  }

  log('Nenhum texto completo disponível — será usado abstract');
  return { texto: '', fonte: 'abstract', completo: false, url: null };
}
