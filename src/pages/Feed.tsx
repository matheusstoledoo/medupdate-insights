import { useState, useEffect } from "react";
import { abrirLinkExterno, getLinkArtigo, getLabelLinkArtigo } from "@/utils/artigoUtils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Search,
  ExternalLink,
  ArrowLeft,
  Heart,
  Zap,
  Activity,
  Gauge,
  Stethoscope,
  Shield,
  Layers,
  Pill,
  Scan,
  Cpu,
  Dumbbell,
  Brain,
  Star,
} from "lucide-react";
import Header from "@/components/Header";
import GradeBadge from "@/components/GradeBadge";
import BuscaAtiva from "@/components/BuscaAtiva";
import UploadArtigo from "@/components/UploadArtigo";
import { useStreak } from "@/hooks/use-streak";

type Modo = "atualizacoes" | "busca" | "upload" | "revisoes";
type FeedState = "temas" | "artigos" | "top10";

interface Tema {
  nome: string;
  icon: React.ReactNode;
}

const TEMAS: Tema[] = [
  { nome: "Insuficiência Cardíaca", icon: <Heart className="h-5 w-5" /> },
  { nome: "Arritmias / FA", icon: <Zap className="h-5 w-5" /> },
  { nome: "Cardiopatia Isquêmica", icon: <Activity className="h-5 w-5" /> },
  { nome: "Hipertensão Arterial", icon: <Gauge className="h-5 w-5" /> },
  { nome: "Valvopatias", icon: <Stethoscope className="h-5 w-5" /> },
  { nome: "Cardiologia Preventiva", icon: <Shield className="h-5 w-5" /> },
  { nome: "Miocardiopatias", icon: <Layers className="h-5 w-5" /> },
  { nome: "Cardio-oncologia", icon: <Pill className="h-5 w-5" /> },
  { nome: "Imagem Cardíaca", icon: <Scan className="h-5 w-5" /> },
  { nome: "Dispositivos / Eletrof.", icon: <Cpu className="h-5 w-5" /> },
  { nome: "Reabilitação Cardíaca", icon: <Dumbbell className="h-5 w-5" /> },
  { nome: "Síncope / Lipotímia", icon: <Brain className="h-5 w-5" /> },
];

const JOURNALS_IMPACTO = [
  "N Engl J Med",
  "Lancet",
  "JAMA",
  "JACC",
  "Circulation",
  "Eur Heart J",
  "BMJ",
  "Nat Med",
  "JAMA Cardiol",
  "J Am Coll Cardiol",
  "The Lancet",
  "European Heart Journal",
  "JAMA cardiology",
  "Nature Medicine",
  "New England Journal of Medicine",
];

const get12MonthsAgo = (): string => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().split("T")[0];
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
  const { user } = useAuth();
  const { streakAtual } = useStreak();
  const [modo, setModo] = useState<Modo>("atualizacoes");
  const [feedState, setFeedState] = useState<FeedState>("temas");
  const [temaSelecionado, setTemaSelecionado] = useState<string>("");
  const [artigos, setArtigos] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [artigosMes, setArtigosMes] = useState<any[]>([]);
  const [artigosArquivo, setArtigosArquivo] = useState<any[]>([]);

  // Handle ?tab=upload from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') === 'upload') {
      setModo('upload');
    }
  }, []);

  const selecionarTema = (tema: string) => {
    setTemaSelecionado(tema);
    setFeedState("artigos");
    setArtigos([]);
    setArtigosMes([]);
    setArtigosArquivo([]);
  };

  const abrirTop10 = () => {
    setFeedState("top10");
  };

  const voltarTemas = () => {
    setFeedState("temas");
    setArtigos([]);
    setArtigosMes([]);
    setArtigosArquivo([]);
    setTemaSelecionado("");
  };

  // Fetch articles when state changes
  useEffect(() => {
    if (modo !== "atualizacoes") return;
    if (feedState === "temas") return;

    const buscar = async () => {
      setIsLoading(true);
      const dataCorte = get12MonthsAgo();

      if (feedState === "artigos" && temaSelecionado) {
        const [semana, mes, arquivo] = await Promise.all([
          (supabase.from("artigos").select("*") as any)
            .eq("especialidade_tema", temaSelecionado)
            .eq("periodo_feed", "semanal")
            .order("data_entrada_feed", { ascending: false })
            .limit(20),
          (supabase.from("artigos").select("*") as any)
            .eq("especialidade_tema", temaSelecionado)
            .eq("periodo_feed", "mensal")
            .order("data_entrada_feed", { ascending: false })
            .limit(30),
          (supabase.from("artigos").select("*") as any)
            .eq("especialidade_tema", temaSelecionado)
            .eq("periodo_feed", "arquivo")
            .order("data_entrada_feed", { ascending: false })
            .limit(50),
        ]);
        setArtigos(semana.data || []);
        setArtigosMes(mes.data || []);
        setArtigosArquivo(arquivo.data || []);
      }

      if (feedState === "top10") {
        // Use ilike for flexible journal matching
        const { data, error } = await supabase
          .from("artigos")
          .select("*")
          .gte("data_publicacao", dataCorte)
          .order("data_publicacao", { ascending: false })
          .limit(100);

        if (!error && data) {
          // Client-side filter for journal matching (case-insensitive partial match)
          const filtered = data.filter((a) => {
            const j = (a.journal || "").toLowerCase();
            return JOURNALS_IMPACTO.some((ji) => j.includes(ji.toLowerCase()) || ji.toLowerCase().includes(j));
          });
          setArtigos(filtered.slice(0, 10));
        }
      }

      setIsLoading(false);
    };

    buscar();
  }, [feedState, temaSelecionado, modo]);

  const { data: pendentes } = useQuery({
    queryKey: ["revisoes-pendentes", user?.id],
    queryFn: async () => {
      const amanha = new Date();
      amanha.setDate(amanha.getDate() + 1);
      amanha.setHours(0, 0, 0, 0);
      const { count, error } = await supabase
        .from("revisoes_artigo")
        .select("id", { count: "exact", head: true })
        .eq("usuario_id", user!.id)
        .lte("proxima_revisao", amanha.toISOString());
      if (error) return 0;
      return count || 0;
    },
    enabled: !!user,
    refetchInterval: 60000,
  });

  const modos: { key: Modo; label: string; badge?: number | null }[] = [
    { key: "atualizacoes", label: "Atualizações" },
    { key: "busca", label: "Busca Ativa" },
    { key: "upload", label: "Upload" },
    { key: "revisoes", label: "Revisões", badge: pendentes && pendentes > 0 ? pendentes : null },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header streakAtual={streakAtual} />

      {/* Nav tabs */}
      <div className="bg-surface-inverse">
        <div className="container flex gap-1 pb-0">
          {modos.map((m) => (
            <button
              key={m.key}
              onClick={() => {
                setModo(m.key);
                if (m.key === "atualizacoes") setFeedState("temas");
              }}
              className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
                modo === m.key ? "text-white" : "text-white/50 hover:text-white/70"
              }`}
            >
              <span className="flex items-center gap-1.5">
                {m.label}
                {m.badge != null && (
                  <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[0.6rem] font-bold text-white">
                    {m.badge}
                  </span>
                )}
              </span>
              {modo === m.key && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-white rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      <main className="container max-w-[720px] py-8">
        {modo === "revisoes" ? (
          <RevisoesInline />
        ) : modo === "upload" ? (
          <UploadArtigo />
        ) : modo === "busca" ? (
          <BuscaAtiva />
        ) : (
          <>
            {/* STATE 1: Theme selection */}
            {feedState === "temas" && (
              <div>
                <h1 className="font-serif text-[1.4rem] font-bold text-foreground mb-1" style={{ letterSpacing: "-0.025em" }}>
                  O que há de novo em Cardiologia?
                </h1>
                <p className="text-[0.9rem] text-muted-foreground mb-8">
                  Selecione um tema para ver as atualizações dos últimos 12 meses
                </p>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                  {TEMAS.map((tema) => (
                    <button
                      key={tema.nome}
                      onClick={() => selecionarTema(tema.nome)}
                      className="flex items-center gap-3 rounded-lg border border-[hsl(var(--border))] bg-card p-4 text-left transition-all hover:border-primary/30 hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] group"
                    >
                      <span className="text-muted-foreground group-hover:text-primary transition-colors">
                        {tema.icon}
                      </span>
                      <span className="text-[0.85rem] font-medium text-foreground leading-tight">
                        {tema.nome}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Special card: Top 10 */}
                <button
                  onClick={abrirTop10}
                  className="w-full flex items-center gap-4 rounded-lg border-2 border-primary/20 bg-accent-light p-5 text-left transition-all hover:border-primary/40 hover:shadow-[0_4px_12px_rgba(0,0,0,0.1)] group"
                >
                  <span className="flex items-center justify-center rounded-lg bg-primary/10 p-3 group-hover:bg-primary/15 transition-colors">
                    <Star className="h-6 w-6 text-primary" />
                  </span>
                  <div>
                    <span className="text-[0.95rem] font-semibold text-foreground block">
                      Síntese dos 10 artigos de maior impacto
                    </span>
                    <span className="text-xs text-muted-foreground">
                      NEJM · Lancet · JAMA · JACC · Circulation · Eur Heart J · BMJ
                    </span>
                  </div>
                </button>
              </div>
            )}

            {/* STATE 2: Articles for selected theme */}
            {feedState === "artigos" && (
              <div>
                <button
                  onClick={voltarTemas}
                  className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" /> Outros temas
                </button>

                <h1 className="font-serif text-[1.3rem] font-bold text-foreground mb-6" style={{ letterSpacing: "-0.025em" }}>
                  {temaSelecionado}
                </h1>

                {isLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-40 rounded-lg bg-surface-secondary animate-pulse" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-10">
                    {/* SEÇÃO 1 — Esta semana */}
                    <section>
                      <div className="flex items-center gap-3 mb-4">
                        <h2 className="text-[0.68rem] font-medium uppercase tracking-[0.1em] text-muted-foreground font-mono">
                          Esta semana
                        </h2>
                        {artigos.length > 0 && (
                          <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-white">
                            {artigos.length} novo{artigos.length > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      {artigos.length > 0 ? (
                        <ArticleList artigos={artigos} />
                      ) : (
                        <p className="text-sm text-muted-foreground py-4 border border-dashed border-border rounded-lg text-center">
                          Nenhum artigo novo esta semana neste tema
                        </p>
                      )}
                    </section>

                    {/* SEÇÃO 2 — Este mês */}
                    <section>
                      <div className="flex items-center gap-3 mb-4">
                        <h2 className="text-[0.68rem] font-medium uppercase tracking-[0.1em] text-muted-foreground font-mono">
                          Este mês
                        </h2>
                        {artigosMes.length > 0 && (
                          <span className="rounded-full bg-surface-tertiary border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {artigosMes.length}
                          </span>
                        )}
                      </div>
                      {artigosMes.length > 0 ? (
                        <ArticleList artigos={artigosMes} />
                      ) : (
                        <p className="text-sm text-muted-foreground py-4 border border-dashed border-border rounded-lg text-center">
                          Nenhum artigo este mês neste tema
                        </p>
                      )}
                    </section>

                    {/* SEÇÃO 3 — Arquivo anual (colapsada) */}
                    <section>
                      <details className="group">
                        <summary className="flex items-center gap-3 cursor-pointer list-none select-none">
                          <h2 className="text-[0.68rem] font-medium uppercase tracking-[0.1em] text-muted-foreground font-mono hover:text-foreground transition-colors">
                            🗂 Arquivo anual
                          </h2>
                          {artigosArquivo.length > 0 && (
                            <span className="rounded-full bg-surface-tertiary border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {artigosArquivo.length}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground group-open:hidden">
                            (clique para expandir)
                          </span>
                        </summary>
                        <div className="mt-4">
                          <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 mb-4">
                            <p className="text-xs text-amber-700">
                              Artigos com mais de 30 dias — podem não refletir as recomendações mais atuais
                            </p>
                          </div>
                          {artigosArquivo.length > 0 ? (
                            <ArticleList artigos={artigosArquivo} />
                          ) : (
                            <p className="text-sm text-muted-foreground text-center py-4">
                              Nenhum artigo no arquivo para este tema
                            </p>
                          )}
                        </div>
                      </details>
                    </section>
                  </div>
                )}
              </div>
            )}

            {/* STATE 3: Top 10 highest impact */}
            {feedState === "top10" && (
              <div>
                <button
                  onClick={voltarTemas}
                  className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" /> Outros temas
                </button>

                <h1 className="font-serif text-[1.3rem] font-bold text-foreground mb-1" style={{ letterSpacing: "-0.025em" }}>
                  Top 10 · Maior Impacto · Últimos 12 meses
                </h1>
                <p className="text-xs text-muted-foreground mb-6">
                  Artigos das revistas de maior fator de impacto em cardiologia
                </p>

                {isLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-40 rounded-lg bg-surface-secondary animate-pulse" />
                    ))}
                  </div>
                ) : artigos.length > 0 ? (
                  <div className="space-y-4">
                    {artigos.map((artigo, index) => {
                      const badge = formatarBadgeData(artigo.data_publicacao);
                      return (
                        <article
                          key={artigo.id}
                          className="rounded-lg border border-[hsl(var(--border))] bg-card p-5 transition-all hover:border-[hsl(40_6%_10%/0.18)] hover:shadow-[0_2px_6px_rgba(0,0,0,0.08)] relative"
                          style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
                        >
                          <div className="flex items-start gap-4">
                            <span className="flex items-center justify-center rounded-full bg-primary/10 text-primary font-mono text-sm font-bold w-8 h-8 shrink-0 mt-0.5">
                              {index + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              {badge && (
                                <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-medium mb-2 ${badge.className}`}>
                                  {badge.label}
                                </span>
                              )}
                              <div className="flex items-center gap-2 mb-1.5">
                                <GradeBadge grade={artigo.grade || ""} />
                                <span className="inline-block rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold text-primary uppercase tracking-wider">
                                  {artigo.journal}
                                </span>
                              </div>
                              <h2 className="font-serif text-[1.02rem] font-semibold text-foreground leading-snug mb-2" style={{ letterSpacing: "-0.02em" }}>
                                {artigo.titulo}
                              </h2>
                              <p className="text-[0.85rem] text-muted-foreground line-clamp-2 mb-3 leading-relaxed">
                                {artigo.resumo_pt}
                              </p>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 font-mono text-[0.72rem] text-muted-foreground">
                                  <span>{artigo.ano}</span>
                                  {getLinkArtigo(artigo) && (
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
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-16">
                    <p className="text-sm text-muted-foreground">
                      Nenhum artigo de alto impacto encontrado nos últimos 12 meses.
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

/** Reusable article list for theme view */
const ArticleList = ({ artigos }: { artigos: any[] }) => (
  <div className="space-y-4">
    {artigos.map((artigo) => {
      const badge = formatarBadgeData(artigo.data_publicacao);
      return (
        <article
          key={artigo.id}
          className="rounded-lg border border-[hsl(var(--border))] bg-card p-5 transition-all hover:border-[hsl(40_6%_10%/0.18)] hover:shadow-[0_2px_6px_rgba(0,0,0,0.08)] relative"
          style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
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
          <h2 className="font-serif text-[1.05rem] font-semibold text-foreground leading-snug mb-2 pr-16" style={{ letterSpacing: "-0.02em" }}>
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
              {getLinkArtigo(artigo) && (
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
  </div>
);

export default Feed;
