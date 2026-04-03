import { useState, useEffect } from "react";
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
  X,
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
  artigoLocal?: { id: string; grade?: string | null } | null;
}

interface NormalizacaoResult {
  query_pubmed: string;
  query_cochrane: string;
  termos_identificados: string[];
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

const BuscaAtiva = () => {
  const [texto, setTexto] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [normalizando, setNormalizando] = useState(false);
  const [resultados, setResultados] = useState<PubMedResult[]>([]);
  const [normalizacao, setNormalizacao] = useState<NormalizacaoResult | null>(null);
  const [queryEditavel, setQueryEditavel] = useState("");
  const [queryAberta, setQueryAberta] = useState(false);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [tipoEstudo, setTipoEstudo] = useState<TipoEstudo>("todos");
  const [periodo, setPeriodo] = useState<Periodo>("todos");
  const [fontes, setFontes] = useState({ pubmed: true, cochrane: true });
  const [buscasRecentes, setBuscasRecentes] = useState<{ id: string; texto_original: string }[]>([]);
  const [erroMsg, setErroMsg] = useState<string | null>(null);
  const [buscaRealizada, setBuscaRealizada] = useState(false);

  // Load recent searches
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

  const salvarBusca = async (textoOriginal: string, queryPubmed: string, queryCochrane: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("buscas").insert({
      usuario_id: user.id,
      texto_original: textoOriginal,
      query_pubmed: queryPubmed,
      query_cochrane: queryCochrane,
    });
    // Refresh recent
    const { data } = await supabase
      .from("buscas")
      .select("id, texto_original")
      .eq("usuario_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5);
    if (data) setBuscasRecentes(data);
  };

  const buscarPubMed = async (query: string) => {
    // Build date filter
    let dateFilter = "";
    if (periodo === "2anos") {
      const minYear = new Date().getFullYear() - 2;
      dateFilter = ` AND ("${minYear}"[pdat]:"3000"[pdat])`;
    } else if (periodo === "5anos") {
      const minYear = new Date().getFullYear() - 5;
      dateFilter = ` AND ("${minYear}"[pdat]:"3000"[pdat])`;
    }

    const fullQuery = query + dateFilter;
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(fullQuery)}&retmax=10&retmode=json&sort=relevance`;

    const searchResp = await fetch(searchUrl);
    const searchData = await searchResp.json();
    const pmids: string[] = searchData.esearchresult?.idlist || [];

    if (pmids.length === 0) return [];

    // Fetch details
    const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmids.join(",")}&retmode=xml`;
    const fetchResp = await fetch(fetchUrl);
    const xmlText = await fetchResp.text();

    // Parse XML
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
        .select("id, pmid, grade")
        .in("pmid", pmidList);

      if (locais) {
        const pmidMap = new Map(locais.map((a) => [a.pmid, { id: a.id, grade: a.grade }]));
        results.forEach((r) => {
          r.artigoLocal = pmidMap.get(r.pmid) || null;
        });
      }
    }

    return results;
  };

  const executarBusca = async (textoOverride?: string) => {
    const textoFinal = textoOverride || texto;
    if (!textoFinal.trim()) return;

    setErroMsg(null);
    setBuscaRealizada(true);
    setNormalizando(true);
    setResultados([]);
    setNormalizacao(null);

    try {
      // Step 1: Normalize with Claude
      const { data: normData, error: normError } = await supabase.functions.invoke(
        "normalizar-busca",
        { body: { texto: textoFinal, filtros: { tipoEstudo, periodo } } }
      );

      if (normError) throw new Error(normError.message || "Erro na normalização");
      if (normData?.error) throw new Error(normData.error);

      setNormalizacao(normData);
      setQueryEditavel(normData.query_pubmed || "");
      setNormalizando(false);

      // Save search
      salvarBusca(textoFinal, normData.query_pubmed, normData.query_cochrane);

      // Step 2: Search PubMed
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

  const cochraneUrl = normalizacao
    ? `https://www.cochranelibrary.com/search?searchBy=6&searchText=${encodeURIComponent(normalizacao.query_cochrane)}&isWordVariations=&resultPerPage=10`
    : "";

  const abrirLink = (url: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

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
            className="w-full rounded-lg border border-border bg-card pl-12 pr-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary/50"
          />
        </div>
        <button
          onClick={() => executarBusca()}
          disabled={normalizando || buscando || !texto.trim()}
          className="rounded-lg bg-secondary px-6 py-3.5 text-sm font-medium text-secondary-foreground hover:bg-secondary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
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
          className={`rounded-full px-4 py-1.5 text-xs font-medium border transition-colors ${
            fontes.pubmed
              ? "bg-secondary/15 text-secondary border-secondary/30"
              : "bg-transparent text-muted-foreground border-border"
          }`}
        >
          PubMed
        </button>
        <button
          onClick={() => setFontes((f) => ({ ...f, cochrane: !f.cochrane }))}
          className={`rounded-full px-4 py-1.5 text-xs font-medium border transition-colors ${
            fontes.cochrane
              ? "bg-secondary/15 text-secondary border-secondary/30"
              : "bg-transparent text-muted-foreground border-border"
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
                  className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                    tipoEstudo === t
                      ? "bg-secondary text-secondary-foreground border-secondary"
                      : "bg-transparent text-muted-foreground border-border hover:border-muted-foreground/50"
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
                  className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                    periodo === p
                      ? "bg-secondary text-secondary-foreground border-secondary"
                      : "bg-transparent text-muted-foreground border-border hover:border-muted-foreground/50"
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
        <div className="flex items-center gap-3 rounded-lg border border-secondary/20 bg-secondary/5 p-4">
          <Loader2 className="h-5 w-5 animate-spin text-secondary" />
          <span className="text-sm text-secondary">Traduzindo sua busca para linguagem técnica...</span>
        </div>
      )}

      {/* Error */}
      {erroMsg && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {erroMsg}
        </div>
      )}

      {/* Generated query */}
      {normalizacao && (
        <Collapsible open={queryAberta} onOpenChange={setQueryAberta}>
          <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            {queryAberta ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            Query utilizada
            <span className="text-xs text-secondary">({normalizacao.tipo_busca})</span>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-3 rounded-lg border border-border bg-card p-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">PubMed Query</label>
              <textarea
                value={queryEditavel}
                onChange={(e) => setQueryEditavel(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-border bg-background p-3 font-mono text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-secondary/50"
              />
              <button
                onClick={reexecutarComQuery}
                disabled={buscando}
                className="mt-2 text-xs text-secondary hover:underline"
              >
                Re-executar com query editada
              </button>
            </div>
            {normalizacao.query_cochrane && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Cochrane Query</label>
                <p className="font-mono text-xs text-muted-foreground">{normalizacao.query_cochrane}</p>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {normalizacao.termos_identificados?.map((t, i) => (
                <span key={i} className="rounded-full bg-secondary/15 px-2.5 py-0.5 text-[10px] font-medium text-secondary border border-secondary/20">
                  {t}
                </span>
              ))}
            </div>
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
                      className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-secondary/30"
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <h3 className="text-sm font-semibold text-foreground leading-snug flex-1">
                          {r.titulo}
                        </h3>
                        {r.artigoLocal ? (
                          <span className="shrink-0 rounded-full bg-primary/15 text-primary border border-primary/30 px-2.5 py-0.5 text-[10px] font-medium">
                            Análise disponível
                          </span>
                        ) : (
                          <span className="shrink-0 rounded-full bg-secondary/15 text-secondary border border-secondary/30 px-2.5 py-0.5 text-[10px] font-medium">
                            Novo
                          </span>
                        )}
                      </div>

                      {r.abstract && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                          {r.abstract}
                        </p>
                      )}

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {r.artigoLocal?.grade && <GradeBadge grade={r.artigoLocal.grade} />}
                          <span className="font-mono uppercase tracking-wider">{r.journal}</span>
                          {r.ano && (
                            <>
                              <span>·</span>
                              <span>{r.ano}</span>
                            </>
                          )}
                          <span>·</span>
                          <span className="font-mono">PMID {r.pmid}</span>
                        </div>

                        {r.artigoLocal ? (
                          <Link
                            to={`/artigo/${r.artigoLocal.id}`}
                            className="text-xs font-medium text-primary hover:underline"
                          >
                            Ver análise completa →
                          </Link>
                        ) : (
                          <button
                            onClick={() => abrirLink(r.link)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-secondary hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Ver no PubMed
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
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
                      {normalizacao.termos_identificados?.map((t, i) => (
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
