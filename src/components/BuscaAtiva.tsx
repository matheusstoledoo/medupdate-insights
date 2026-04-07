import { useState, useEffect } from "react";
import { abrirLinkExterno, buscarTextoCompletoNoFrontend } from "@/utils/artigoUtils";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import {
  Search,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Loader2,
  Clock,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import GradeBadge from "@/components/GradeBadge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

type TipoEstudo = "todos" | "rct" | "meta" | "revisao" | "coorte";
type Periodo = "todos" | "2anos" | "5anos";

interface PubMedResult {
  pmid: string;
  titulo: string;
  abstract: string;
  journal: string;
  ano: string;
  link: string;
  artigoLocal?: { id: string; grade?: string | null; resumo_pt?: string | null } | null;
  analisando?: boolean;
  statusAnalise?: string;
  analisadoDoAbstract?: boolean;
}

interface Conceito {
  conceito: string;
  termos_usados: string[];
}

interface NormalizacaoResult {
  query_pubmed: string;
  query_cochrane: string;
  conceitos?: Conceito[];
  termos_identificados?: string[];
  tipo_busca: string;
}

const tipoEstudoLabels: Record<TipoEstudo, string> = {
  todos: "Todos",
  rct: "RCT",
  meta: "Meta-análise",
  revisao: "Revisão sistemática",
  coorte: "Coorte",
};

const periodoLabels: Record<Periodo, string> = {
  todos: "Todos",
  "2anos": "Últimos 2 anos",
  "5anos": "Últimos 5 anos",
};

const conceitoEmojis = ["🔵", "🟢", "🟠", "🟣", "🔴"];

const BuscaAtiva = () => {
  const [texto, setTexto] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [normalizando, setNormalizando] = useState(false);
  const [resultados, setResultados] = useState<PubMedResult[]>([]);
  const [normalizacao, setNormalizacao] = useState<NormalizacaoResult | null>(null);
  const [queryEditavel, setQueryEditavel] = useState("");
  const [queryAberta, setQueryAberta] = useState(false);
  const [queryTecnicaAberta, setQueryTecnicaAberta] = useState(false);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [tipoEstudo, setTipoEstudo] = useState<TipoEstudo>("todos");
  const [periodo, setPeriodo] = useState<Periodo>("todos");
  const [fontes, setFontes] = useState({ pubmed: true, cochrane: true });
  const [buscasRecentes, setBuscasRecentes] = useState<{ id: string; texto_original: string }[]>([]);
  const [erroMsg, setErroMsg] = useState<string | null>(null);
  const [buscaRealizada, setBuscaRealizada] = useState(false);
  const [analisesRealizadas, setAnalisesRealizadas] = useState(0);

  useEffect(() => {
    const carregarRecentes = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("buscas")
        .select("id, texto_original")
        .eq("usuario_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5);
      if (data) setBuscasRecentes(data);
    };
    carregarRecentes();
  }, []);

  // Reset analysis count on new search
  const resetAnalises = () => setAnalisesRealizadas(0);

  const salvarBusca = async (textoOriginal: string, queryPubmed: string, queryCochrane: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("buscas").insert({
      usuario_id: user.id,
      texto_original: textoOriginal,
      query_pubmed: queryPubmed,
      query_cochrane: queryCochrane,
    });
    const { data } = await supabase
      .from("buscas")
      .select("id, texto_original")
      .eq("usuario_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5);
    if (data) setBuscasRecentes(data);
  };

  const buscarPubMed = async (query: string) => {
    let dateFilter = "";
    if (periodo === "2anos") {
      const minYear = new Date().getFullYear() - 2;
      dateFilter = ` AND ("${minYear}"[pdat]:"3000"[pdat])`;
    } else if (periodo === "5anos") {
      const minYear = new Date().getFullYear() - 5;
      dateFilter = ` AND ("${minYear}"[pdat]:"3000"[pdat])`;
    }

    const fullQuery = query + dateFilter;
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(fullQuery)}&retmax=20&retmode=json&sort=relevance`;

    const searchResp = await fetch(searchUrl);
    const searchData = await searchResp.json();
    const pmids: string[] = searchData.esearchresult?.idlist || [];

    if (pmids.length === 0) return [];

    const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmids.join(",")}&retmode=xml`;
    const fetchResp = await fetch(fetchUrl);
    const xmlText = await fetchResp.text();

    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "text/xml");
    const articles = doc.querySelectorAll("PubmedArticle");

    const results: PubMedResult[] = [];
    articles.forEach((article) => {
      const pmid = article.querySelector("PMID")?.textContent || "";
      const titulo = article.querySelector("ArticleTitle")?.textContent || "";
      const abstractEl = article.querySelector("AbstractText");
      const abstract = abstractEl?.textContent || "";
      const journal = article.querySelector("Journal Title")?.textContent ||
        article.querySelector("ISOAbbreviation")?.textContent || "";
      const year = article.querySelector("PubDate Year")?.textContent ||
        article.querySelector("PubDate MedlineDate")?.textContent?.slice(0, 4) || "";

      results.push({
        pmid,
        titulo,
        abstract,
        journal,
        ano: year,
        link: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
        artigoLocal: null,
      });
    });

    // Check which PMIDs exist locally
    if (results.length > 0) {
      const pmidList = results.map((r) => r.pmid).filter(Boolean);
      const { data: locais } = await supabase
        .from("artigos")
        .select("id, pmid, grade, resumo_pt")
        .in("pmid", pmidList);

      if (locais) {
        const pmidMap = new Map(locais.map((a) => [a.pmid, { id: a.id, grade: a.grade, resumo_pt: a.resumo_pt }]));
        results.forEach((r) => {
          r.artigoLocal = pmidMap.get(r.pmid) || null;
        });
      }
    }

    // Sort: articles with local analysis first, then by year DESC
    const comAnalise = results.filter((r) => r.artigoLocal).sort((a, b) => Number(b.ano || 0) - Number(a.ano || 0));
    const semAnalise = results.filter((r) => !r.artigoLocal).sort((a, b) => Number(b.ano || 0) - Number(a.ano || 0));

    return [...comAnalise, ...semAnalise];
  };

  const executarBusca = async (textoOverride?: string) => {
    const textoFinal = textoOverride || texto;
    if (!textoFinal.trim()) return;

    setErroMsg(null);
    setBuscaRealizada(true);
    setNormalizando(true);
    setResultados([]);
    setNormalizacao(null);
    resetAnalises();

    try {
      const { data: normData, error: normError } = await supabase.functions.invoke(
        "normalizar-busca",
        { body: { texto: textoFinal, filtros: { tipoEstudo, periodo } } }
      );

      if (normError) throw new Error(normError.message || "Erro na normalização");
      if (normData?.error) throw new Error(normData.error);

      setNormalizacao(normData);
      setQueryEditavel(normData.query_pubmed || "");
      setNormalizando(false);

      salvarBusca(textoFinal, normData.query_pubmed, normData.query_cochrane);

      if (fontes.pubmed) {
        setBuscando(true);
        const results = await buscarPubMed(normData.query_pubmed);
        setResultados(results);
        setBuscando(false);
      }
    } catch (err: any) {
      console.error("Erro na busca:", err);
      setErroMsg(err.message || "Erro ao realizar busca");
      setNormalizando(false);
      setBuscando(false);
    }
  };

  const reexecutarComQuery = async () => {
    if (!queryEditavel.trim()) return;
    setBuscando(true);
    setErroMsg(null);
    try {
      const results = await buscarPubMed(queryEditavel);
      setResultados(results);
    } catch (err: any) {
      setErroMsg(err.message || "Erro ao buscar no PubMed");
    }
    setBuscando(false);
  };

  const atualizarStatus = (pmid: string, msg: string) => {
    setResultados((prev) =>
      prev.map((r) => (r.pmid === pmid ? { ...r, statusAnalise: msg } : r))
    );
  };

  const analisarArtigo = async (pmid: string) => {
    if (analisesRealizadas >= 3) return;

    setResultados((prev) =>
      prev.map((r) => (r.pmid === pmid ? { ...r, analisando: true, statusAnalise: 'Verificando disponibilidade de texto completo...' } : r))
    );

    try {
      // PASSO 1: Buscar texto completo no FRONTEND (browser não é bloqueado)
      const fullText = await buscarTextoCompletoNoFrontend(pmid, (msg) => atualizarStatus(pmid, msg));

      // PASSO 2: Enviar para Edge Function com texto já extraído
      atualizarStatus(pmid, fullText.completo ? 'Analisando com IA (texto completo)...' : 'Analisando com IA...');

      const { data, error } = await supabase.functions.invoke("processar-artigo-unico", {
        body: {
          pmid,
          textoCompleto: fullText.completo ? fullText.texto : undefined,
          fonteTexto: fullText.completo ? fullText.fonte : undefined,
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      setResultados((prev) =>
        prev.map((r) =>
          r.pmid === pmid
            ? {
                ...r,
                analisando: false,
                statusAnalise: undefined,
                artigoLocal: { id: data.id, grade: data.grade, resumo_pt: data.resumo_pt },
                analisadoDoAbstract: !fullText.completo,
              }
            : r
        )
      );
      setAnalisesRealizadas((prev) => prev + 1);
    } catch (err: any) {
      console.error("Erro ao analisar artigo:", err);
      setResultados((prev) =>
        prev.map((r) => (r.pmid === pmid ? { ...r, analisando: false, statusAnalise: undefined } : r))
      );
      setErroMsg(`Erro ao analisar PMID ${pmid}: ${err.message}`);
    }
  };

  const cochraneUrl = normalizacao
    ? `https://www.cochranelibrary.com/search?searchBy=6&searchText=${encodeURIComponent(normalizacao.query_cochrane)}&isWordVariations=&resultPerPage=10`
    : "";

  const abrirLink = (url: string) => abrirLinkExterno(url);

  return (
    <div className="space-y-6">
      {/* Search input */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Ex: tratamento da insuficiência cardíaca com fração de ejeção reduzida"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && executarBusca()}
            className="w-full rounded-lg border-[1.5px] border-[hsl(var(--border))] bg-card pl-12 pr-4 py-3.5 text-[0.97rem] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-light focus:border-primary"
          />
        </div>
        <button
          onClick={() => executarBusca()}
          disabled={normalizando || buscando || !texto.trim()}
          className="rounded-md bg-primary px-6 py-3.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          {normalizando || buscando ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          Buscar
        </button>
      </div>


      {/* Source toggles */}
      <div className="flex gap-2">
        <button
          onClick={() => setFontes((f) => ({ ...f, pubmed: !f.pubmed }))}
          className={`rounded px-4 py-1.5 text-[0.72rem] font-medium uppercase tracking-wide border transition-colors ${
            fontes.pubmed
              ? "bg-accent-light text-primary border-primary/20"
              : "bg-transparent text-muted-foreground border-[hsl(var(--border))]"
          }`}
        >
          PubMed
        </button>
        <button
          onClick={() => setFontes((f) => ({ ...f, cochrane: !f.cochrane }))}
          className={`rounded px-4 py-1.5 text-[0.72rem] font-medium uppercase tracking-wide border transition-colors ${
            fontes.cochrane
              ? "bg-accent-light text-primary border-primary/20"
              : "bg-transparent text-muted-foreground border-[hsl(var(--border))]"
          }`}
        >
          Cochrane
        </button>
      </div>

      {/* Advanced filters */}
      <Collapsible open={filtrosAbertos} onOpenChange={setFiltrosAbertos}>
        <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          {filtrosAbertos ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          Filtros avançados
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3 space-y-4 rounded-lg border border-border bg-card p-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Tipo de estudo</label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(tipoEstudoLabels) as TipoEstudo[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTipoEstudo(t)}
                  className={`rounded px-3 py-1 text-[0.72rem] font-medium uppercase tracking-wide border transition-colors ${
                    tipoEstudo === t
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-transparent text-muted-foreground border-[hsl(var(--border))] hover:text-foreground"
                  }`}
                >
                  {tipoEstudoLabels[t]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Período</label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(periodoLabels) as Periodo[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriodo(p)}
                  className={`rounded px-3 py-1 text-[0.72rem] font-medium uppercase tracking-wide border transition-colors ${
                    periodo === p
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-transparent text-muted-foreground border-[hsl(var(--border))] hover:text-foreground"
                  }`}
                >
                  {periodoLabels[p]}
                </button>
              ))}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Recent searches */}
      {buscasRecentes.length > 0 && !buscaRealizada && (
        <div className="flex items-center gap-2 flex-wrap">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Recentes:</span>
          {buscasRecentes.map((b) => (
            <button
              key={b.id}
              onClick={() => {
                setTexto(b.texto_original);
                executarBusca(b.texto_original);
              }}
              className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {b.texto_original}
            </button>
          ))}
        </div>
      )}

      {/* Normalizing indicator */}
      {normalizando && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-accent-light p-4">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm text-primary">Traduzindo sua busca para linguagem técnica...</span>
        </div>
      )}

      {/* Error */}
      {erroMsg && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{erroMsg}</span>
        </div>
      )}

      {/* Generated query — concept-based display */}
      {normalizacao && (
        <Collapsible open={queryAberta} onOpenChange={setQueryAberta}>
          <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            {queryAberta ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            Query utilizada
            <span className="text-xs text-primary">({normalizacao.tipo_busca})</span>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-4 rounded-lg border border-border bg-card p-4">
            {/* Concepts display */}
            {normalizacao.conceitos && normalizacao.conceitos.length > 0 && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">Conceitos identificados</label>
                <div className="space-y-2">
                  {normalizacao.conceitos.map((c, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-sm">{conceitoEmojis[i % conceitoEmojis.length]}</span>
                      <div>
                        <span className="text-xs font-medium text-foreground">{c.conceito}:</span>
                        <span className="text-xs text-muted-foreground ml-1">
                          {c.termos_usados.join(", ")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Fallback for old format */}
            {!normalizacao.conceitos && normalizacao.termos_identificados && (
              <div className="flex flex-wrap gap-1.5">
                {normalizacao.termos_identificados.map((t, i) => (
                  <span key={i} className="rounded px-2.5 py-0.5 text-[10px] font-medium text-primary bg-accent-light border border-primary/20">
                    {t}
                  </span>
                ))}
              </div>
            )}

            {/* Technical query collapsible */}
            <Collapsible open={queryTecnicaAberta} onOpenChange={setQueryTecnicaAberta}>
              <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                {queryTecnicaAberta ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                Query técnica PubMed (clique para ver)
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-3">
                <textarea
                  value={queryEditavel}
                  onChange={(e) => setQueryEditavel(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-border bg-background p-3 font-mono text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-secondary/50"
                />
                <button
                  onClick={reexecutarComQuery}
                  disabled={buscando}
                  className="text-xs text-secondary hover:underline"
                >
                  Re-executar com query editada
                </button>
              </CollapsibleContent>
            </Collapsible>

            {normalizacao.query_cochrane && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Cochrane Query</label>
                <p className="font-mono text-xs text-muted-foreground">{normalizacao.query_cochrane}</p>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Results */}
      {buscaRealizada && !normalizando && (
        <div className="space-y-6">
          {/* PubMed results */}
          {fontes.pubmed && (
            <section>
              <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-secondary" />
                PubMed — Artigos encontrados ({resultados.length})
              </h2>

              {buscando ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-32 rounded-lg bg-card animate-pulse" />
                  ))}
                </div>
              ) : resultados.length > 0 ? (
                <div className="space-y-3">
                  {resultados.map((r) => (
                    <article
                      key={r.pmid}
                      className={`rounded-lg border bg-card p-4 transition-all ${
                        r.analisando ? "border-primary/40 bg-accent-light" : "border-[hsl(var(--border))] hover:border-[hsl(40_6%_10%/0.18)] hover:shadow-[0_2px_6px_rgba(0,0,0,0.08)]"
                      }`}
                      style={{ boxShadow: r.analisando ? undefined : '0 1px 3px rgba(0,0,0,0.06)' }}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <h3 className="font-serif text-[0.95rem] font-semibold text-foreground leading-snug flex-1" style={{ letterSpacing: '-0.01em' }}>
                          {r.titulo}
                        </h3>
                        {r.artigoLocal ? (
                          <span className="shrink-0 rounded px-2.5 py-0.5 text-[10px] font-medium bg-grade-a-bg text-grade-a-text">
                            Análise disponível
                          </span>
                        ) : (
                          <span className="shrink-0 rounded px-2.5 py-0.5 text-[10px] font-medium bg-accent-light text-primary">
                            Novo
                          </span>
                        )}
                      </div>

                      {/* Show resumo if analyzed */}
                      {r.artigoLocal?.resumo_pt && (
                        <>
                          {r.analisadoDoAbstract && (
                            <div className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium bg-grade-b-bg text-grade-b-text mb-2">
                              <AlertCircle className="h-3 w-3 shrink-0" />
                              Texto completo não disponível — análise baseada no abstract
                            </div>
                          )}
                          <p className="text-xs text-foreground/80 mb-3 leading-relaxed">
                            {r.artigoLocal.resumo_pt}
                          </p>
                        </>
                      )}

                      {/* Show abstract if no local analysis */}
                      {!r.artigoLocal && r.abstract && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                          {r.abstract}
                        </p>
                      )}

                      {/* Analyzing state */}
                      {r.analisando && (
                        <div className="flex items-center gap-2 mb-3 rounded-md bg-accent-light px-3 py-2">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                          <span className="text-xs text-primary">{r.statusAnalise || 'Analisando...'}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-mono text-[0.72rem] text-muted-foreground">
                          {r.artigoLocal?.grade && <GradeBadge grade={r.artigoLocal.grade} />}
                          <span className="uppercase tracking-widest">{r.journal}</span>
                          {r.ano && (
                            <>
                              <span>·</span>
                              <span>{r.ano}</span>
                            </>
                          )}
                          <span>·</span>
                          <span className="font-mono">PMID {r.pmid}</span>
                        </div>

                        <div className="flex items-center gap-3">
                          {r.artigoLocal ? (
                            <>
                              <Link
                                to={`/artigo/${r.artigoLocal.id}`}
                                className="text-xs font-medium text-primary hover:underline"
                              >
                                Ver análise completa →
                              </Link>
                              <Link
                                to={`/quiz/${r.artigoLocal.id}`}
                                className="text-xs font-medium text-secondary hover:underline"
                              >
                                Responder questão →
                              </Link>
                            </>
                          ) : r.analisando ? null : (
                            <>
                              {analisesRealizadas < 3 ? (
                                <button
                                  onClick={() => analisarArtigo(r.pmid)}
                                  className="inline-flex items-center gap-1.5 rounded-md bg-accent-light px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors border border-primary/20"
                                >
                                  <Sparkles className="h-3 w-3" />
                                  Analisar este artigo
                                </button>
                              ) : (
                                <span className="text-[10px] text-muted-foreground italic">
                                  Limite de análises atingido
                                </span>
                              )}
                              <button
                                onClick={() => abrirLink(r.link)}
                                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                              >
                                <ExternalLink className="h-3 w-3" />
                                PubMed
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}

                  {/* Analysis limit warning */}
                  {analisesRealizadas >= 3 && (
                    <div className="rounded-lg border border-primary/20 bg-accent-light p-3 text-xs text-primary flex items-center gap-2">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      Limite de 3 análises por busca atingido. Inicie uma nova busca para analisar mais artigos.
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-card p-6 text-center">
                  <p className="text-sm text-muted-foreground mb-2">
                    Nenhum artigo encontrado no PubMed.
                  </p>
                  {normalizacao && (
                    <p className="text-xs text-muted-foreground">
                      Query utilizada: <code className="font-mono text-[10px]">{queryEditavel}</code>
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    Tente termos mais gerais, como "heart failure treatment" ou "anticoagulants stroke"
                  </p>
                </div>
              )}
            </section>
          )}

          {/* Cochrane section */}
          {fontes.cochrane && normalizacao && (
            <section>
              <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-secondary" />
                Cochrane — Revisões sistemáticas
              </h2>
              <div className="rounded-lg border border-secondary/20 bg-secondary/5 p-5">
                <div className="flex items-start gap-4">
                  <div className="rounded-lg bg-secondary/15 p-2.5">
                    <BookOpen className="h-6 w-6 text-secondary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-foreground mb-1">
                      Revisões Cochrane relacionadas
                    </h3>
                    <p className="text-xs text-muted-foreground mb-3">
                      Encontramos revisões sistemáticas Cochrane relacionadas à sua busca.
                    </p>
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {(normalizacao.conceitos || []).map((c, i) => (
                        <span key={i} className="rounded-full bg-secondary/10 px-2 py-0.5 text-[10px] text-secondary">
                          {c.conceito}
                        </span>
                      ))}
                      {!normalizacao.conceitos && normalizacao.termos_identificados?.map((t, i) => (
                        <span key={i} className="rounded-full bg-secondary/10 px-2 py-0.5 text-[10px] text-secondary">
                          {t}
                        </span>
                      ))}
                    </div>
                    <button
                      onClick={() => abrirLink(cochraneUrl)}
                      className="inline-flex items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/90 transition-colors"
                    >
                      Ver revisões Cochrane
                      <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                    <p className="text-[10px] text-muted-foreground mt-2">
                      Os resultados abrem diretamente no site da Cochrane Library
                    </p>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
};

export default BuscaAtiva;
