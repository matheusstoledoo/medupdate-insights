import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Search, ExternalLink } from "lucide-react";
import Header from "@/components/Header";
import GradeBadge from "@/components/GradeBadge";
import BuscaAtiva from "@/components/BuscaAtiva";
import UploadArtigo from "@/components/UploadArtigo";
import { useStreak } from "@/hooks/use-streak";

type Filtro = "hoje" | "semana" | "mes" | "ano" | "todos";
type Modo = "atualizacoes" | "busca" | "upload";

const filtroLabels: Record<Filtro, string> = {
  hoje: "Hoje",
  semana: "Esta semana",
  mes: "Este mês",
  ano: "Este ano",
  todos: "Todos",
};

const getDataCorte = (filtro: Filtro): string | null => {
  const hoje = new Date();
  switch (filtro) {
    case "hoje":
      return hoje.toISOString().split("T")[0];
    case "semana": {
      const d = new Date(hoje);
      d.setDate(hoje.getDate() - 7);
      return d.toISOString().split("T")[0];
    }
    case "mes":
      return new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split("T")[0];
    case "ano":
      return `${hoje.getFullYear()}-01-01`;
    default:
      return null;
  }
};

const abrirArtigo = (url: string) => abrirLinkExterno(url);

const formatarBadgeData = (dataStr: string | null) => {
  if (!dataStr) return null;
  const data = new Date(dataStr + "T00:00:00");
  const hoje = new Date();
  const todayStart = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const diff = Math.floor((todayStart.getTime() - data.getTime()) / 86400000);

  if (diff === 0) return { label: "Hoje", className: "bg-primary/15 text-primary border-primary/30" };
  if (diff <= 7) return { label: `${diff}d atrás`, className: "bg-blue-500/15 text-blue-400 border-blue-500/30" };
  if (diff <= 30) {
    return { label: data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), className: "bg-muted text-muted-foreground border-border" };
  }
  return { label: data.toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" }), className: "bg-muted text-muted-foreground border-border" };
};

const Feed = () => {
  const { streakAtual } = useStreak();
  const [modo, setModo] = useState<Modo>("atualizacoes");
  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("semana");
  const [artigos, setArtigos] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [mensagemVazio, setMensagemVazio] = useState<string | null>(null);

  useEffect(() => {
    if (modo !== "atualizacoes") return;

    const buscar = async () => {
      setIsLoading(true);
      setMensagemVazio(null);

      const dataCorte = getDataCorte(filtro);

      let query = supabase
        .from("artigos")
        .select("*")
        .order("data_publicacao", { ascending: false })
        .order("score_relevancia", { ascending: false })
        .limit(20);

      if (search.trim()) {
        query = query.ilike("titulo", `%${search.trim()}%`);
      }
      if (dataCorte) {
        query = query.gte("data_publicacao", dataCorte);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Erro ao buscar artigos:", error);
        setIsLoading(false);
        return;
      }

      setArtigos(data || []);
      if ((!data || data.length === 0) && filtro !== "todos") {
        setMensagemVazio("Nenhum artigo encontrado para este período.");
      }
      setIsLoading(false);
    };

    buscar();
  }, [filtro, search, modo]);

  const now = new Date();
  const weekLabel = `Semana de ${now.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })}`;

  return (
    <div className="min-h-screen bg-background">
      <Header streakAtual={streakAtual} />
      <main className="container py-8">
        {/* Mode toggle */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setModo("atualizacoes")}
            className={`rounded-lg px-5 py-2 text-sm font-medium transition-colors ${
              modo === "atualizacoes"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            Atualizações
          </button>
          <button
            onClick={() => setModo("busca")}
            className={`rounded-lg px-5 py-2 text-sm font-medium transition-colors ${
              modo === "busca"
                ? "bg-secondary text-secondary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            Busca Ativa
          </button>
          <button
            onClick={() => setModo("upload")}
            className={`rounded-lg px-5 py-2 text-sm font-medium transition-colors ${
              modo === "upload"
                ? "bg-secondary text-secondary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            Upload
          </button>
        </div>

        {modo === "upload" ? (
          <UploadArtigo />
        ) : modo === "busca" ? (
          <BuscaAtiva />
        ) : (
          <>
            <h1 className="text-2xl font-semibold text-foreground mb-1">
              Cardiologia · {weekLabel}
            </h1>

            {/* Period filters */}
            <div className="flex gap-2 mt-4 mb-2 overflow-x-auto pb-2">
              {(Object.keys(filtroLabels) as Filtro[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFiltro(f)}
                  className={`whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-medium transition-colors border ${
                    filtro === f
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-transparent text-muted-foreground border-border hover:border-muted-foreground/50"
                  }`}
                >
                  {filtroLabels[f]}
                </button>
              ))}
            </div>

            {mensagemVazio && (
              <div className="text-center py-2 mb-4">
                <p className="text-sm text-muted-foreground italic">{mensagemVazio}</p>
                <button
                  onClick={() => setFiltro("todos")}
                  className="text-sm text-primary hover:underline mt-1"
                >
                  Ver todos os artigos →
                </button>
              </div>
            )}

            <div className="relative mt-2 mb-8">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar por título do artigo..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-border bg-card pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-40 rounded-lg bg-card animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {artigos.map((artigo) => {
                  const badge = formatarBadgeData(artigo.data_publicacao);
                  return (
                    <article
                      key={artigo.id}
                      className="rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/30 relative"
                    >
                      {badge && (
                        <span className={`absolute top-3 right-3 rounded-full border px-2.5 py-0.5 text-[10px] font-medium ${badge.className}`}>
                          {badge.label}
                        </span>
                      )}
                      <div className="flex items-center gap-3 mb-3 pr-20">
                        <GradeBadge grade={artigo.grade || ""} />
                        <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                          {artigo.journal}
                        </span>
                      </div>

                      <h2 className="text-base font-semibold text-foreground leading-snug mb-2 pr-16">
                        {artigo.titulo}
                      </h2>

                      <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                        {artigo.resumo_pt}
                      </p>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{artigo.ano}</span>
                          <span>·</span>
                          <span>{artigo.citacoes} citações</span>
                          {artigo.link_original && (
                            <>
                              <span>·</span>
                              <button
                                onClick={() => abrirArtigo(artigo.link_original!)}
                                className="inline-flex items-center gap-1 text-secondary hover:underline"
                              >
                                <ExternalLink className="h-3 w-3" />
                                PubMed
                              </button>
                            </>
                          )}
                        </div>
                        <Link
                          to={`/artigo/${artigo.id}`}
                          className="text-sm font-medium text-primary hover:underline"
                        >
                          Ver análise →
                        </Link>
                      </div>
                    </article>
                  );
                })}

                {artigos.length === 0 && (
                  <p className="text-center text-muted-foreground py-12">
                    Nenhum artigo encontrado.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default Feed;
