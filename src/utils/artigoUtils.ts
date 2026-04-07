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
  fonte_texto?: string | null;
}): string {
  if (artigo.tem_texto_completo && artigo.url_texto_completo) {
    if (!artigo.url_texto_completo.includes('pmc.ncbi')) {
      return artigo.url_texto_completo;
    }
  }
  if (artigo.link_original) return artigo.link_original;
  if (artigo.pmid) return 'https://pubmed.ncbi.nlm.nih.gov/' + artigo.pmid + '/';
  return '';
}

export function getLabelLinkArtigo(artigo: {
  tem_texto_completo?: boolean;
  fonte_texto?: string | null;
  url_texto_completo?: string | null;
}): string {
  if (artigo.tem_texto_completo) {
    const fonte = artigo.fonte_texto || 'acesso aberto';
    if (artigo.url_texto_completo?.includes('pmc.ncbi')) {
      return 'Ver no PubMed (texto completo disponível) ↗';
    }
    return 'Ver texto completo (' + fonte + ') ↗';
  }
  return 'Ver no PubMed ↗';
}

export interface ResultadoTextoCompleto {
  texto: string;
  fonte: string;
  completo: boolean;
  url: string | null;
}

export async function buscarTextoCompletoNoFrontend(
  pmid: string,
  onStatus?: (msg: string) => void
): Promise<ResultadoTextoCompleto> {
  const log = (m: string) => { console.log('[FRONTEND] ' + m); onStatus?.(m); };

  // NÃO tentar PMC aqui — causa CORS no browser
  // PMC é buscado pela Edge Function (servidor)

  log('Buscando links de acesso aberto...');
  try {
    const elinkResp = await fetch(
      'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/elink.fcgi?dbfrom=pubmed&id='
      + pmid + '&cmd=llinkslib&retmode=xml&email=medupdate@app.com'
    );
    const xml = await elinkResp.text();
    const blocos = xml.match(/<ObjUrl>[\s\S]*?<\/ObjUrl>/gi) || [];

    for (const bloco of blocos) {
      const um = bloco.match(/<Url><!\[CDATA\[([^\]]+)\]\]><\/Url>|<Url>([^<]+)<\/Url>/);
      if (!um) continue;
      const urlOriginal = (um[1] || um[2] || '').trim().replace(/&amp;/g, '&');
      if (!urlOriginal.startsWith('http')) continue;

      // Ignorar links do próprio PMC/NCBI (CORS bloqueado no browser)
      if (urlOriginal.includes('ncbi.nlm.nih.gov') ||
          urlOriginal.includes('nih.gov') ||
          urlOriginal.includes('europepmc.org')) continue;

      const attrs = (bloco.match(/<Attribute>[\s\S]*?<\/Attribute>/gi) || [])
        .map(a => a.replace(/<\/?Attribute>/gi, '').toLowerCase());
      const livre = attrs.some(a =>
        a.includes('free') || a.includes('open access') ||
        a.includes('full-text online') || a.includes('freely available'));
      const pago = attrs.some(a =>
        a.includes('subscription') || a.includes('fee required') || a.includes('membership'));
      if (!livre || pago) continue;

      // Converter URL de PDF para HTML
      const urlsParaTentar: string[] = [];
      const ehPDF = urlOriginal.includes('pdfdirect') ||
                    urlOriginal.includes('/pdf/') ||
                    urlOriginal.endsWith('.pdf');
      if (ehPDF) {
        urlsParaTentar.push(urlOriginal.replace('/pdfdirect/', '/full/').replace('/pdf/', '/full/'));
        urlsParaTentar.push(urlOriginal.replace(/\/pdf(\/|$)/, '/'));
      }
      urlsParaTentar.push(urlOriginal);

      for (const url of urlsParaTentar) {
        log('Tentando ' + url.substring(0, 60) + '...');
        try {
          const resp = await fetch(url, {
            headers: { 'Accept': 'text/html,*/*', 'Accept-Language': 'en-US,en;q=0.9' },
            signal: AbortSignal.timeout(15000)
          });
          if (!resp.ok) continue;
          if ((resp.headers.get('content-type') || '').includes('pdf')) continue;
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
            else if (url.includes('academic.oup.com')) fonte = 'Oxford Academic';
            else if (url.includes('wiley.com') || url.includes('onlinelibrary')) fonte = 'Wiley';
            else if (url.includes('frontiersin.org')) fonte = 'Frontiers';
            else if (url.includes('mdpi.com')) fonte = 'MDPI';
            else if (url.includes('plos')) fonte = 'PLOS';
            log('✓ ' + fonte + ': ' + texto.length + ' chars');
            return { texto: texto.substring(0, 12000), fonte, completo: true, url };
          }
        } catch (e) { log('Falhou: ' + e); }
      }
    }
  } catch (e) { log('ELink falhou: ' + e); }

  return { texto: '', fonte: 'abstract', completo: false, url: null };
}
