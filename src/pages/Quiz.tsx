import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import Header from "@/components/Header";
import GradeBadge from "@/components/GradeBadge";
import { toast } from "sonner";

const letterMap: Record<string, string> = { A: "alt_a", B: "alt_b", C: "alt_c", D: "alt_d" };
const altKeys = ["alt_a", "alt_b", "alt_c", "alt_d"] as const;
const letterLabels = ["A", "B", "C", "D"];

const Quiz = () => {
  const { id } = useParams<{ id: string }>();
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dismissed, setDismissed] = useState(false);

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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-8">
          <div className="h-64 rounded-lg bg-card animate-pulse" />
        </main>
      </div>
    );
  }

  if (!artigo) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-8 text-center text-muted-foreground">
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

  const handleConfirm = () => {
    setConfirmed(true);
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

      // Save progress after login
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Upsert user
        await supabase.from("usuarios").upsert({
          id: user.id,
          email: user.email,
        }, { onConflict: "id" });

        // Save progress
        await supabase.from("progresso").insert({
          usuario_id: user.id,
          artigo_id: artigo.id,
          respondeu: true,
          acertou,
          data_resposta: new Date().toISOString(),
          proxima_revisao: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        });

        setSaved(true);
        toast.success("Progresso salvo! Lembrete de revisão agendado para daqui 7 dias.");
      }
    } catch (e) {
      toast.error("Erro ao salvar progresso");
    } finally {
      setSaving(false);
    }
  };

  // Check if user returned from OAuth redirect
  const checkExistingSession = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user && confirmed && !saved && !dismissed) {
      setSaving(true);
      await supabase.from("usuarios").upsert({
        id: user.id,
        email: user.email,
      }, { onConflict: "id" });

      await supabase.from("progresso").insert({
        usuario_id: user.id,
        artigo_id: artigo.id,
        respondeu: true,
        acertou,
        data_resposta: new Date().toISOString(),
        proxima_revisao: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      });

      setSaved(true);
      setSaving(false);
      toast.success("Progresso salvo!");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container max-w-3xl py-8">
        {/* Article header */}
        <div className="flex items-center gap-3 mb-6">
          <GradeBadge grade={artigo.grade || ""} />
          <h2 className="text-sm text-muted-foreground line-clamp-1 flex-1">
            {artigo.titulo}
          </h2>
        </div>

        {/* Question */}
        <div className="mb-6">
          <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            Questão clínica
          </span>
          <p className="mt-2 text-base font-medium text-foreground leading-relaxed">
            {artigo.questao}
          </p>
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
                    className={`w-full text-left rounded-lg border px-4 py-3 text-sm transition-colors ${
                      isSelected
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-card text-foreground/80 hover:border-muted-foreground/30"
                    }`}
                  >
                    <span className="font-mono font-semibold mr-2 text-muted-foreground">
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
                className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Confirmar resposta
              </button>
            )}
          </>
        ) : (
          <>
            {/* Feedback banner */}
            {acertou ? (
              <div className="rounded-lg bg-primary/15 border border-primary/30 px-4 py-3 mb-6">
                <span className="text-sm font-semibold text-primary">✓ Correto!</span>
              </div>
            ) : (
              <div className="rounded-lg bg-grade-b-bg border border-grade-b-text/30 px-4 py-3 mb-6">
                <span className="text-sm font-semibold text-grade-b-text">
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
                    className={`w-full rounded-lg border px-4 py-3 text-sm ${
                      isCorrect
                        ? "border-primary/50 bg-primary/10 text-foreground"
                        : isWrong
                        ? "border-destructive/50 bg-destructive/10 text-foreground"
                        : "border-border bg-card text-foreground/60"
                    }`}
                  >
                    <span className="font-mono font-semibold mr-2 text-muted-foreground">
                      {letterLabels[i]}.
                    </span>
                    {text}
                  </div>
                );
              })}
            </div>

            {/* Feedback text */}
            <div className="rounded-lg border border-border bg-card p-5 mb-8">
              <p className="text-sm leading-relaxed text-foreground/90">
                {artigo.feedback_quiz}
              </p>
            </div>

            {/* Soft wall / saved state */}
            {saved ? (
              <div className="text-center space-y-4">
                <p className="text-sm text-primary font-medium">
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
            ) : (
              <div className="rounded-lg border border-primary/20 bg-card p-6 text-center">
                <h3 className="text-lg font-semibold text-foreground mb-1">
                  Salve seu progresso
                </h3>
                <p className="text-sm text-muted-foreground mb-5">
                  Crie sua conta gratuita para acompanhar sua evolução e receber lembretes de revisão no momento certo
                </p>
                <button
                  onClick={handleGoogleLogin}
                  disabled={saving}
                  className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 mb-3"
                >
                  {saving ? "Entrando..." : "Entrar com Google →"}
                </button>
                <button
                  onClick={() => setDismissed(true)}
                  className="text-xs text-muted-foreground hover:text-foreground"
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
