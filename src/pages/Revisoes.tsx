import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import Header from "@/components/Header";
import { ChevronDown, ChevronRight, BookOpen } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface RevisaoComArtigo {
  id: string;
  artigo_id: string;
  proxima_revisao: string | null;
  ultima_revisao: string | null;
  state: string | null;
  reps: number | null;
  lapses: number | null;
  stability: number | null;
  difficulty: number | null;
  scheduled_days: number | null;
  artigo: {
    titulo: string;
    journal: string | null;
    ano: number | null;
    tipo_estudo: string | null;
    resumo_pt: string | null;
  };
}

const Revisoes = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [hojeOpen, setHojeOpen] = useState(true);
  const [semanaOpen, setSemanaOpen] = useState(true);
  const [concluidasOpen, setConcluidasOpen] = useState(true);
  const [animatingIds, setAnimatingIds] = useState<Set<string>>(new Set());

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const hojeISO = hoje.toISOString();
  const amanha = new Date(hoje);
  amanha.setDate(amanha.getDate() + 1);
  const amanhaISO = amanha.toISOString();
  const semanaFim = new Date(hoje);
  semanaFim.setDate(semanaFim.getDate() + 7);
  const semanaFimISO = semanaFim.toISOString();

  const { data: revisoes, isLoading } = useQuery({
    queryKey: ["revisoes", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("revisoes_artigo")
        .select("*, artigo:artigos(titulo, journal, ano, tipo_estudo, resumo_pt)")
        .eq("usuario_id", user!.id);
      if (error) throw error;
      return (data || []) as unknown as RevisaoComArtigo[];
    },
    enabled: !!user,
  });

  const pendentesHoje = (revisoes || []).filter((r) => {
    if (!r.proxima_revisao) return false;
    const d = new Date(r.proxima_revisao);
    return d <= amanha && (!r.ultima_revisao || new Date(r.ultima_revisao) < hoje);
  });

  const estaSemana = (revisoes || []).filter((r) => {
    if (!r.proxima_revisao) return false;
    const d = new Date(r.proxima_revisao);
    return d >= amanha && d < semanaFim && (!r.ultima_revisao || new Date(r.ultima_revisao) < hoje);
  });

  const concluidasHojeList = (revisoes || []).filter((r) => {
    if (!r.ultima_revisao) return false;
    return new Date(r.ultima_revisao) >= hoje;
  });

  const reviewMutation = useMutation({
    mutationFn: async ({
      revisao,
      dias,
      resultado,
    }: {
      revisao: RevisaoComArtigo;
      dias: number;
      resultado: string;
    }) => {
      const novaData = new Date();
      novaData.setDate(novaData.getDate() + dias);
      const isLapse = resultado === "nao_lembrei";

      const { error: upsertError } = await supabase
        .from("revisoes_artigo")
        .update({
          state: "review",
          ultima_revisao: new Date().toISOString(),
          proxima_revisao: novaData.toISOString(),
          reps: (revisao.reps || 0) + 1,
          lapses: isLapse ? (revisao.lapses || 0) + 1 : revisao.lapses || 0,
          scheduled_days: dias,
        })
        .eq("id", revisao.id);
      if (upsertError) throw upsertError;

      const { error: histError } = await supabase
        .from("historico_respostas")
        .insert({
          usuario_id: user!.id,
          artigo_id: revisao.artigo_id,
          resultado,
          respondido_em: new Date().toISOString(),
          stability_antes: revisao.stability,
          difficulty_antes: revisao.difficulty,
          scheduled_days_antes: revisao.scheduled_days,
        });
      if (histError) throw histError;
    },
    onSuccess: (_, { revisao }) => {
      setAnimatingIds((prev) => new Set(prev).add(revisao.id));
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["revisoes"] });
        queryClient.invalidateQueries({ queryKey: ["revisoes-pendentes"] });
        setAnimatingIds((prev) => {
          const next = new Set(prev);
          next.delete(revisao.id);
          return next;
        });
      }, 400);
      toast.success("Revisão registrada!");
    },
    onError: () => toast.error("Erro ao salvar revisão"),
  });

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container max-w-[720px] py-8">
          <div className="h-64 rounded-lg bg-muted animate-pulse" />
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container max-w-[720px] py-8 text-center">
          <p className="text-muted-foreground">Faça login para acessar suas revisões.</p>
        </main>
      </div>
    );
  }

  const renderCard = (r: RevisaoComArtigo, showButtons: boolean) => (
    <div
      key={r.id}
      className={`rounded-lg border bg-card p-4 mb-3 transition-all duration-300 ${
        animatingIds.has(r.id) ? "opacity-0 translate-x-4" : "opacity-100"
      }`}
    >
      <button
        onClick={() => navigate(`/artigo/${r.artigo_id}`)}
        className="text-left w-full"
      >
        <h3 className="font-serif text-sm font-semibold text-foreground leading-snug mb-1">
          {r.artigo?.titulo}
        </h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono mb-1">
          {r.artigo?.journal && <span>{r.artigo.journal}</span>}
          {r.artigo?.ano && (
            <>
              <span>·</span>
              <span>{r.artigo.ano}</span>
            </>
          )}
          {r.artigo?.tipo_estudo && (
            <>
              <span>·</span>
              <span>{r.artigo.tipo_estudo}</span>
            </>
          )}
        </div>
        {r.artigo?.resumo_pt && (
          <p className="text-xs text-muted-foreground line-clamp-1">
            {r.artigo.resumo_pt.slice(0, 100)}
            {r.artigo.resumo_pt.length > 100 ? "…" : ""}
          </p>
        )}
      </button>

      {showButtons && (
        <div className="grid grid-cols-4 gap-2 mt-3">
          {[
            { emoji: "🔴", label: "Não lembrei", dias: 1, resultado: "nao_lembrei" },
            { emoji: "🟡", label: "Difícil", dias: 3, resultado: "dificil" },
            { emoji: "🟢", label: "Lembrei", dias: 7, resultado: "lembrei" },
            { emoji: "🔵", label: "Fácil", dias: 14, resultado: "facil" },
          ].map((btn) => (
            <button
              key={btn.resultado}
              disabled={reviewMutation.isPending}
              onClick={(e) => {
                e.stopPropagation();
                reviewMutation.mutate({ revisao: r, dias: btn.dias, resultado: btn.resultado });
              }}
              className="flex flex-col items-center gap-0.5 rounded-md border bg-background px-2 py-2 text-xs hover:bg-muted transition-colors disabled:opacity-50"
            >
              <span className="text-base">{btn.emoji}</span>
              <span className="text-[0.65rem] text-muted-foreground">{btn.label}</span>
              <span className="text-[0.6rem] text-muted-foreground/60">+{btn.dias}d</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const Section = ({
    title,
    count,
    open,
    onOpenChange,
    children,
    badgeColor = "bg-primary",
  }: {
    title: string;
    count: number;
    open: boolean;
    onOpenChange: (v: boolean) => void;
    children: React.ReactNode;
    badgeColor?: string;
  }) => (
    <Collapsible open={open} onOpenChange={onOpenChange} className="mb-4">
      <CollapsibleTrigger className="flex items-center gap-2 w-full py-3 text-left">
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <span className="text-sm font-medium">{title}</span>
        {count > 0 && (
          <Badge className={`${badgeColor} text-white text-[0.65rem] px-1.5 py-0`}>{count}</Badge>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container max-w-[720px] py-8">
        <h1 className="font-serif text-xl font-bold mb-6">Suas Revisões</h1>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : pendentesHoje.length === 0 && estaSemana.length === 0 && concluidasHojeList.length === 0 ? (
          <div className="text-center py-16">
            <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
            <p className="text-lg font-medium text-foreground mb-1">Nenhuma revisão pendente hoje 🎉</p>
            <p className="text-sm text-muted-foreground mb-4">
              Explore artigos novos e adicione-os à sua fila de revisões.
            </p>
            <button
              onClick={() => navigate("/feed")}
              className="text-sm text-primary hover:underline"
            >
              Explorar artigos →
            </button>
          </div>
        ) : (
          <>
            <Section
              title="Hoje"
              count={pendentesHoje.length}
              open={hojeOpen}
              onOpenChange={setHojeOpen}
              badgeColor="bg-destructive"
            >
              {pendentesHoje.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2 pl-6">Nenhuma revisão pendente hoje 🎉</p>
              ) : (
                pendentesHoje.map((r) => renderCard(r, true))
              )}
            </Section>

            <Section
              title="Esta semana"
              count={estaSemana.length}
              open={semanaOpen}
              onOpenChange={setSemanaOpen}
            >
              {estaSemana.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2 pl-6">Nenhuma revisão agendada para esta semana.</p>
              ) : (
                estaSemana.map((r) => renderCard(r, false))
              )}
            </Section>

            <Section
              title="Concluídas hoje"
              count={concluidasHojeList.length}
              open={concluidasOpen}
              onOpenChange={setConcluidasOpen}
              badgeColor="bg-green-600"
            >
              {concluidasHojeList.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2 pl-6">Nenhuma revisão concluída hoje.</p>
              ) : (
                concluidasHojeList.map((r) => renderCard(r, false))
              )}
            </Section>
          </>
        )}
      </main>
    </div>
  );
};

export default Revisoes;
