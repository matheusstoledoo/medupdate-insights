import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/contexts/AuthContext";
import Header from "@/components/Header";
import GradeBadge from "@/components/GradeBadge";
import { toast } from "sonner";

const letterMap: Record<string, string> = { A: "alt_a", B: "alt_b", C: "alt_c", D: "alt_d" };
const altKeys = ["alt_a", "alt_b", "alt_c", "alt_d"] as const;
const letterLabels = ["A", "B", "C", "D"];

const Quiz = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [streakAtual, setStreakAtual] = useState<number | null>(null);

  const { data: artigo, isLoading } = useQuery({
    queryKey: ["artigo", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("artigos")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const updateStreak = async (userId: string) => {
    try {
      await supabase.rpc('atualizar_streak', { p_usuario_id: userId });
      const { data: streakData } = await supabase
        .from('streaks')
        .select('streak_atual, total_questoes_respondidas')
        .eq('usuario_id', userId)
        .maybeSingle();
      if (streakData) {
        setStreakAtual(streakData.streak_atual);
      }
    } catch (e) {
      console.error('Erro ao atualizar streak:', e);
    }
  };

  const saveProgress = async (userId: string, userEmail: string | undefined, acertouValue: boolean) => {
    if (!artigo) return;
    await supabase.from("usuarios").upsert({
      id: userId,
      email: userEmail,
    }, { onConflict: "id" });

    await supabase.from("progresso").insert({
      usuario_id: userId,
      artigo_id: artigo.id,
      respondeu: true,
      acertou: acertouValue,
      data_resposta: new Date().toISOString(),
      proxima_revisao: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    });

    await updateStreak(userId);
    setSaved(true);
  };

  useEffect(() => {
    if (user && confirmed && !saved && !dismissed && artigo) {
      setSaving(true);
      const correctKeyLocal = letterMap[artigo.resposta_correta?.toUpperCase() || ""];
      const acertouLocal = selected === correctKeyLocal;
      saveProgress(user.id, user.email, acertouLocal).then(() => {
        setSaving(false);
        toast.success("Progresso salvo!");
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, confirmed, saved, dismissed, artigo]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container max-w-[720px] py-8">
          <div className="h-64 rounded-lg bg-surface-secondary animate-pulse" />
        </main>
      </div>
    );
  }

  if (!artigo) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container max-w-[720px] py-8 text-center text-muted-foreground">
          Artigo não encontrado.
        </main>
      </div>
    );
  }

  const correctKey = letterMap[artigo.resposta_correta?.toUpperCase() || ""];
  const acertou = selected === correctKey;

  const getAltText = (key: string) => {
    return (artigo as any)[key] as string;
  };

  const handleConfirm = async () => {
    setConfirmed(true);
    if (user) {
      await updateStreak(user.id);
    }
  };

  const handleGoogleLogin = async () => {
    setSaving(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + `/quiz/${id}`,
      });

      if (result.error) {
        toast.error("Erro ao fazer login com Google");
        setSaving(false);
        return;
      }

      if (result.redirected) {
        return;
      }
    } catch (e) {
      toast.error("Erro ao salvar progresso");
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container max-w-[720px] py-8">
        {/* Article header */}
        <div className="flex items-center gap-3 mb-6">
          <GradeBadge grade={artigo.grade || ""} />
          <h2 className="text-sm text-muted-foreground line-clamp-1 flex-1">
            {artigo.titulo}
          </h2>
        </div>

        {/* Question */}
        <div className="mb-6">
          <span className="text-[0.68rem] font-medium uppercase tracking-[0.1em] text-muted-foreground">
            Questão clínica
          </span>
          <div className="mt-3 rounded-md bg-surface-secondary border-l-[3px] border-[hsl(var(--border))] px-4 py-3.5">
            <p className="font-serif italic text-base text-foreground leading-[1.75]">
              {artigo.questao}
            </p>
          </div>
        </div>

        {/* Alternatives */}
        {!confirmed ? (
          <>
            <div className="space-y-3 mb-6">
              {altKeys.map((key, i) => {
                const text = getAltText(key);
                if (!text) return null;
                const isSelected = selected === key;
                return (
                  <button
                    key={key}
                    onClick={() => !confirmed && setSelected(key)}
                    className={`w-full text-left rounded-md border-[1.5px] px-4 py-3 text-[0.9rem] transition-colors ${
                      isSelected
                        ? "border-primary bg-accent-light text-foreground"
                        : "border-[hsl(var(--border))] bg-card text-foreground hover:border-[hsl(40_6%_10%/0.18)]"
                    }`}
                  >
                    <span className="font-mono text-muted-foreground mr-2">
                      {letterLabels[i]}.
                    </span>
                    {text}
                  </button>
                );
              })}
            </div>

            {selected && (
              <button
                onClick={handleConfirm}
                className="rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Confirmar resposta
              </button>
            )}
          </>
        ) : (
          <>
            {/* Feedback banner */}
            {acertou ? (
              <div className="rounded-lg bg-grade-a-bg border-l-[3px] border-grade-a-text px-4 py-3 mb-6">
                <span className="text-sm font-semibold text-grade-a-text">✓ Correto!</span>
              </div>
            ) : (
              <div className="rounded-lg bg-grade-d-bg border-l-[3px] border-grade-d-text px-4 py-3 mb-6">
                <span className="text-sm font-semibold text-grade-d-text">
                  ✗ A resposta correta era {artigo.resposta_correta}:{" "}
                  {getAltText(correctKey)}
                </span>
              </div>
            )}

            {/* Alternatives with colors */}
            <div className="space-y-3 mb-6">
              {altKeys.map((key, i) => {
                const text = getAltText(key);
                if (!text) return null;
                const isCorrect = key === correctKey;
                const isWrong = key === selected && !acertou;
                return (
                  <div
                    key={key}
                    className={`w-full rounded-md border-[1.5px] px-4 py-3 text-[0.9rem] ${
                      isCorrect
                        ? "border-grade-a-text bg-grade-a-bg text-foreground"
                        : isWrong
                        ? "border-grade-d-text bg-grade-d-bg text-foreground"
                        : "border-[hsl(var(--border))] bg-card text-foreground/60"
                    }`}
                  >
                    <span className="font-mono text-muted-foreground mr-2">
                      {letterLabels[i]}.
                    </span>
                    {text}
                  </div>
                );
              })}
            </div>

            {/* Feedback text */}
            <div className={`rounded-lg bg-surface-secondary px-5 py-4 mb-6 border-l-[3px] ${acertou ? 'border-grade-a-text' : 'border-grade-d-text'}`}>
              <p className="text-[0.9rem] leading-[1.7] text-foreground/90">
                {artigo.feedback_quiz}
              </p>
            </div>

            {/* Streak display */}
            {streakAtual !== null && streakAtual >= 3 && (
              <div className={`rounded-md border border-[hsl(var(--border))] bg-surface-secondary px-4 py-3 mb-6 text-center ${
                streakAtual === 7 ? "border-primary" : ""
              }`}>
                <div className={`font-medium text-foreground ${streakAtual === 7 ? "text-lg font-serif italic mb-1" : ""}`}>
                  🔥 {streakAtual === 7 ? "7 dias — uma semana de atualização contínua em Cardiologia" : `${streakAtual} dias`}
                </div>
                {streakAtual !== 7 && (
                  <p className="text-[0.83rem] text-muted-foreground mt-1">
                    você está atualizado em Cardiologia há {streakAtual} dias consecutivos
                  </p>
                )}
              </div>
            )}

            {/* Soft wall / saved state */}
            {saved ? (
              <div className="text-center space-y-4">
                <p className="text-sm text-grade-a-text font-medium">
                  ✓ Progresso salvo! Lembrete de revisão agendado para daqui 7 dias.
                </p>
                <Link
                  to="/feed"
                  className="inline-block text-sm text-muted-foreground hover:text-foreground"
                >
                  ← Voltar ao feed
                </Link>
              </div>
            ) : dismissed ? (
              <div className="text-center">
                <Link
                  to="/feed"
                  className="inline-block text-sm text-muted-foreground hover:text-foreground"
                >
                  ← Voltar ao feed
                </Link>
              </div>
            ) : user ? (
              <div className="text-center">
                <p className="text-sm text-muted-foreground">
                  {saving ? "Salvando progresso..." : ""}
                </p>
              </div>
            ) : (
              <div className="rounded-lg border-[1.5px] border-[hsl(var(--border))] bg-card p-6 text-center">
                <h3 className="text-base font-semibold text-foreground mb-1">
                  Salve seu progresso
                </h3>
                <p className="text-[0.87rem] text-muted-foreground mb-5">
                  Crie sua conta gratuita para acompanhar sua evolução e receber lembretes de revisão no momento certo
                </p>
                <button
                  onClick={handleGoogleLogin}
                  disabled={saving}
                  className="w-full rounded-md bg-primary py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 mb-3"
                >
                  {saving ? "Entrando..." : "Entrar com Google →"}
                </button>
                <button
                  onClick={() => setDismissed(true)}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Continuar sem salvar
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default Quiz;
