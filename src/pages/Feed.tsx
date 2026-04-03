import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Search, ExternalLink } from "lucide-react";
import Header from "@/components/Header";
import GradeBadge from "@/components/GradeBadge";
import { useStreak } from "@/hooks/use-streak";

type Periodo = "hoje" | "semana" | "mes" | "ano" | "todos";

const periodoLabels: Record<Periodo, string> = {
  hoje: "Hoje",
  semana: "Esta semana",
  mes: "Este mês",
  ano: "Este ano",
  todos: "Todos",
};

function getDataInicio(periodo: Periodo): string | null {
  const now = new Date();
  switch (periodo) {
    case "hoje":
      return now.toISOString().split("T")[0];
    case "semana": {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return d.toISOString().split("T")[0];
    }
    case "mes": {
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    }
    case "ano":
      return `${now.getFullYear()}-01-01`;
    case "todos":
      return null;
  }
}

function getDateBadge(dataPub: string | null): { label: string; className: string } | null {
  if (!dataPub) return null;
  const pub = new Date(dataPub + "T00:00:00");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.floor((today.getTime() - pub.getTime()) / (1000 * 60 * 60 * 24));

  if (diff === 0) {
    return { label: "Hoje", className: "bg-primary/15 text-primary border-primary/30" };
  }
  if (diff <= 7) {
    return { label: `${diff}d atrás`, className: "bg-blue-500/15 text-blue-400 border-blue-500/30" };
  }
  if (diff <= 30) {
    const dd = String(pub.getDate()).padStart(2, "0");
    const mm = String(pub.getMonth() + 1).padStart(2, "0");
    return { label: `${dd}/${mm}`, className: "bg-muted text-muted-foreground border-border" };
  }
  const mm = String(pub.getMonth() + 1).padStart(2, "0");
  const yyyy = pub.getFullYear();
  return { label: `${mm}/${yyyy}`, className: "bg-muted text-muted-foreground border-border" };
}

const Feed = () => {
  const { streakAtual } = useStreak();
  const [search, setSearch] = useState("");
  const [periodo, setPeriodo] = useState<Periodo>("semana");
  const [fallbackMsg, setFallbackMsg] = useState<string | null>(null);

  const { data: artigos, isLoading } = useQuery({
    queryKey: ["artigos", search, periodo],
    queryFn: async () => {
      let currentPeriodo = periodo;
      let dataInicio = getDataInicio(currentPeriodo);

      let query = supabase
        .from("artigos")
        .select("*")
        .order("data_publicacao", { ascending: false })
        .order("score_relevancia", { ascending: false })
        .limit(20);

      if (search.trim()) {
        query = query.ilike("titulo", `%${search.trim()}%`);
      }

      if (dataInicio) {
        query = query.gte("data_publicacao", dataInicio);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Auto-fallback: if "semana" returns empty, try "mes"
      if (currentPeriodo === "semana" && (!data || data.length === 0) && !search.trim()) {
        const mesInicio = getDataInicio("mes");
        let fallbackQuery = supabase
          .from("artigos")
          .select("*")
          .order("data_publicacao", { ascending: false })
          .order("score_relevancia", { ascending: false })
          .limit(20);

        if (mesInicio) {
          fallbackQuery = fallbackQuery.gte("data_publicacao", mesInicio);
        }

        const { data: mesData, error: mesError } = await fallbackQuery;
        if (mesError) throw mesError;

        if (mesData && mesData.length > 0) {
          setFallbackMsg("Nenhum artigo novo esta semana — mostrando o mês atual.");
          return mesData;
        }

        // If month also empty, show all
        const { data: allData, error: allError } = await supabase
          .from("artigos")
          .select("*")
          .order("data_publicacao", { ascending: false })
          .order("score_relevancia", { ascending: false })
          .limit(20);
        if (allError) throw allError;
        setFallbackMsg("Nenhum artigo novo este mês — mostrando todos.");
        return allData;
      }

      setFallbackMsg(null);
      return data;
    },
  });

  const now = new Date();
  const weekLabel = `Semana de ${now.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })}`;

  return (
    <div className="min-h-screen bg-background">
      <Header streakAtual={streakAtual} />
      <main className="container py-8">
        <h1 className="text-2xl font-semibold text-foreground mb-1">
          Cardiologia · {weekLabel}
        </h1>

        {/* Period filters */}
        <div className="flex gap-2 mt-4 mb-2 overflow-x-auto pb-2 scrollbar-hide">
          {(Object.keys(periodoLabels) as Periodo[]).map((p) => (
            <button
              key={p}
              onClick={() => { setPeriodo(p); setFallbackMsg(null); }}
              className={`whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-medium transition-colors border ${
                periodo === p
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent text-muted-foreground border-border hover:border-muted-foreground/50"
              }`}
            >
              {periodoLabels[p]}
            </button>
          ))}
        </div>

        {fallbackMsg && (
          <p className="text-sm text-muted-foreground mb-4 italic">{fallbackMsg}</p>
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
            {artigos?.map((artigo) => {
              const badge = getDateBadge(artigo.data_publicacao);
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
                          <a
                            href={artigo.link_original}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-secondary hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                            PubMed
                          </a>
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

            {artigos?.length === 0 && (
              <p className="text-center text-muted-foreground py-12">
                Nenhum artigo encontrado.
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default Feed;
