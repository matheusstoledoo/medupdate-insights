import { useState, useEffect } from "react";
import { abrirLinkExterno, getLinkArtigo, getLabelLinkArtigo } from "@/utils/artigoUtils";
import { supabase } from "@/integrations/supabase/client";
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

type Modo = "atualizacoes" | "busca" | "upload";
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
  const { streakAtual } = useStreak();
  const [modo, setModo] = useState<Modo>("atualizacoes");
  const [feedState, setFeedState] = useState<FeedState>("temas");
  const [temaSelecionado, setTemaSelecionado] = useState<string>("");
  const [artigos, setArtigos] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [artigosMes, setArtigosMes] = useState<any[]>([]);
  const [artigosArquivo, setArtigosArquivo] = useState<any[]>([]);
  const [mostrarMes, setMostrarMes] = useState(false);
  const [mostrarArquivo, setMostrarArquivo] = useState(false);
  const [carregandoMes, setCarregandoMes] = useState(false);
  const [carregandoArquivo, setCarregandoArquivo] = useState(false);

  const selecionarTema = (tema: string) => {
    setTemaSelecionado(tema);
    setFeedState("artigos");
    setArtigos([]);
    setArtigosMes([]);
    setArtigosArquivo([]);
    setMostrarMes(false);
    setMostrarArquivo(false);
  };

  const abrirTop10 = () => {
    setFeedState("top10");
  };

  const voltarTemas = () => {
    setFeedState("temas");
    setArtigos([]);
    setArtigosMes([]);
    setArtigosArquivo([]);
    setMostrarMes(false);
    setMostrarArquivo(false);
    setTemaSelecionado("");
  };

  const carregarMes = async () => {
    setCarregandoMes(true);
    const { data } = await (supabase
      .from("artigos")
      .select("*") as any)
      .eq("especialidade_tema", temaSelecionado)
      .eq("periodo_feed", "mensal")
      .order("data_entrada_feed", { ascending: false })
      .limit(30);
    setArtigosMes(data || []);
    setMostrarMes(true);
    setCarregandoMes(false);
  };

  const carregarArquivo = async () => {
    setCarregandoArquivo(true);
    const { data } = await (supabase
      .from("artigos")
      .select("*") as any)
      .eq("especialidade_tema", temaSelecionado)
      .eq("periodo_feed", "arquivo")
      .order("data_entrada_feed", { ascending: false })
      .limit(50);
    setArtigosArquivo(data || []);
    setMostrarArquivo(true);
    setCarregandoArquivo(false);
  };

  // Fetch articles when state changes
  useEffect(() => {
    if (modo !== "atualizacoes") return;
    if (feedState === "temas") return;

    const buscar = async () => {
      setIsLoading(true);
      const dataCorte = get12MonthsAgo();

      if (feedState === "artigos" && temaSelecionado) {
        const { data, error } = await (supabase
          .from("artigos")
          .select("*") as any)
          .eq("especialidade_tema", temaSelecionado)
          .eq("periodo_feed", "semanal")
          .order("data_entrada_feed", { ascending: false })
          .limit(20);

        if (!error) setArtigos(data || []);
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

  const modos: { key: Modo; label: string }[] = [
    { key: "atualizacoes", label: "Atualizações" },
    { key: "busca", label: "Busca Ativa" },
    { key: "upload", label: "Upload" },
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

                <h1 className="font-serif text-[1.3rem] font-bold text-foreground mb-1" style={{ letterSpacing: "-0.025em" }}>
                  {temaSelecionado}
                </h1>
                <p className="text-xs text-muted-foreground mb-6">Últimos 12 meses · Ordenado por relevância</p>

                {isLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-40 rounded-lg bg-surface-secondary animate-pulse" />
                    ))}
                  </div>
                ) : artigos.length > 0 ? (
                  <ArticleList artigos={artigos} />
                ) : (
                  <div className="text-center py-16">
                    <p className="text-sm text-muted-foreground mb-2">
                      Nenhum artigo encontrado para "{temaSelecionado}" nos últimos 12 meses.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Use a <span className="font-medium text-primary">Busca Ativa</span> para procurar artigos específicos e adicioná-los.
                    </p>
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
