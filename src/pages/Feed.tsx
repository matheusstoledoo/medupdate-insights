import { useState, useEffect } from "react";
import { abrirLinkExterno, getLinkArtigo, getLabelLinkArtigo } from "@/utils/artigoUtils";
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



const formatarBadgeData = (dataStr: string | null) => {
  if (!dataStr) return null;
  const data = new Date(dataStr + "T00:00:00");
  const hoje = new Date();
  const todayStart = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const diff = Math.floor((todayStart.getTime() - data.getTime()) / 86400000);

  if (diff === 0) return { label: "Hoje", className: "bg-accent-light text-primary" };
  if (diff <= 7) return { label: `${diff}d atrás`, className: "bg-accent-light text-accent-mid" };
  if (diff <= 30) {
    return { label: data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), className: "bg-surface-tertiary text-muted-foreground" };
  }
  return { label: data.toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" }), className: "bg-surface-tertiary text-muted-foreground" };
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

  const modos: { key: Modo; label: string }[] = [
    { key: "atualizacoes", label: "Atualizações" },
    { key: "busca", label: "Busca Ativa" },
    { key: "upload", label: "Upload" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header streakAtual={streakAtual} />

      {/* Nav tabs inside dark header extension */}
      <div className="bg-surface-inverse">
        <div className="container flex gap-1 pb-0">
          {modos.map((m) => (
            <button
              key={m.key}
              onClick={() => setModo(m.key)}
              className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
                modo === m.key
                  ? "text-white"
                  : "text-white/50 hover:text-white/70"
              }`}
            >
              {m.label}
              {modo === m.key && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-white rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      <main className="container max-w-[720px] py-8">
        {modo === "upload" ? (
          <UploadArtigo />
        ) : modo === "busca" ? (
          <BuscaAtiva />
        ) : (
          <>
            <h1 className="font-serif text-[1.1rem] font-medium text-foreground mb-1">
              Cardiologia · {weekLabel}
            </h1>

            {/* Period filters */}
            <div className="flex gap-2 mt-4 mb-2 overflow-x-auto pb-2">
              {(Object.keys(filtroLabels) as Filtro[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFiltro(f)}
                  className={`whitespace-nowrap rounded px-3 py-1.5 text-[0.72rem] font-medium uppercase tracking-wide transition-colors ${
                    filtro === f
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface-tertiary text-muted-foreground border border-transparent hover:text-foreground"
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
                className="w-full rounded-lg border-[1.5px] border-[hsl(var(--border))] bg-card pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-light focus:border-primary"
              />
            </div>

            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-40 rounded-lg bg-surface-secondary animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {artigos.map((artigo) => {
                  const badge = formatarBadgeData(artigo.data_publicacao);
                  return (
                    <article
                      key={artigo.id}
                      className="rounded-lg border border-[hsl(var(--border))] bg-card p-5 transition-all hover:border-[hsl(40_6%_10%/0.18)] hover:shadow-[0_2px_6px_rgba(0,0,0,0.08)] relative"
                      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
                    >
                      {badge && (
                        <span className={`absolute top-3 right-3 rounded px-2 py-0.5 text-[10px] font-medium ${badge.className}`}>
                          {badge.label}
                        </span>
                      )}
                      <div className="flex items-center gap-3 mb-2 pr-20">
                        <GradeBadge grade={artigo.grade || ""} />
                        <span className="font-mono text-[0.72rem] uppercase tracking-widest text-muted-foreground">
                          {artigo.journal}
                        </span>
                      </div>

                      <h2 className="font-serif text-[1.05rem] font-semibold text-foreground leading-snug mb-2 pr-16" style={{ letterSpacing: '-0.02em' }}>
                        {artigo.titulo}
                      </h2>

                      <p className="text-[0.88rem] text-muted-foreground line-clamp-2 mb-4 leading-relaxed">
                        {artigo.resumo_pt}
                      </p>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-mono text-[0.72rem] text-muted-foreground">
                          <span>{artigo.ano}</span>
                          <span>·</span>
                          <span>{artigo.citacoes} citações</span>
                          {(artigo.link_original || artigo.pmid) && (
                            <>
                              <span>·</span>
                              <button
                                onClick={() => abrirLinkExterno(getLinkArtigo(artigo))}
                                className="inline-flex items-center gap-1 text-primary hover:underline"
                              >
                                <ExternalLink className="h-3 w-3" />
                                {getLabelLinkArtigo(artigo)}
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
