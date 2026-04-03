import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Search, ExternalLink } from "lucide-react";
import Header from "@/components/Header";
import GradeBadge from "@/components/GradeBadge";
import { useStreak } from "@/hooks/use-streak";

const Feed = () => {
  const { streakAtual } = useStreak();
  const [search, setSearch] = useState("");

  const { data: artigos, isLoading } = useQuery({
    queryKey: ["artigos", search],
    queryFn: async () => {
      let query = supabase
        .from("artigos")
        .select("*")
        .order("score_relevancia", { ascending: false })
        .limit(20);

      if (search.trim()) {
        query = query.ilike("titulo", `%${search.trim()}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const now = new Date();
  const weekLabel = `Semana de ${now.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })}`;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-8">
        <h1 className="text-2xl font-semibold text-foreground mb-1">
          Cardiologia · {weekLabel}
        </h1>

        <div className="relative mt-6 mb-8">
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
            {artigos?.map((artigo) => (
              <article
                key={artigo.id}
                className="rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/30"
              >
                <div className="flex items-center gap-3 mb-3">
                  <GradeBadge grade={artigo.grade || ""} />
                  <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                    {artigo.journal}
                  </span>
                </div>

                <h2 className="text-base font-semibold text-foreground leading-snug mb-2">
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
            ))}

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
