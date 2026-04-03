import { useState, useRef, useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
import { Upload, FileText, FileSearch, AlertTriangle, CheckCircle, XCircle, HelpCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { lovable } from "@/integrations/lovable/index";
import GradeBadge from "@/components/GradeBadge";
import { toast } from "sonner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Estado = "upload" | "processando" | "resultado";

const LOADING_MESSAGES = [
  "Extraindo texto do artigo...",
  "Identificando tipo de estudo e metodologia...",
  "Avaliando qualidade metodológica (RoB 2)...",
  "Gerando questão clínica...",
  "Finalizando análise...",
];

const SESSION_KEY = "medupdate_upload_count";

// --- RoB helpers (same as Artigo.tsx) ---
type DomainStatus = "baixo" | "preocupações" | "alto" | "nao_avaliado";

interface RobDomain {
  id: string;
  label: string;
  status: DomainStatus;
  detail: string;
}

const DOMINIOS_ROB2 = [
  { id: "D1", label: "Processo de randomização" },
  { id: "D2", label: "Desvios da intervenção" },
  { id: "D3", label: "Dados faltantes" },
  { id: "D4", label: "Mensuração dos desfechos" },
  { id: "D5", label: "Seleção dos resultados reportados" },
];

function parseViesesDetalhados(texto: string): RobDomain[] {
  const lines = texto.split(/\n|;/).map(l => l.trim()).filter(Boolean);
  return DOMINIOS_ROB2.map((dominio) => {
    const regex = new RegExp(dominio.id + "|" + dominio.label.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "i");
    const matchLine = lines.find(l => regex.test(l));
    let status: DomainStatus = "nao_avaliado";
    let detail = "Não avaliado — informação insuficiente";
    if (matchLine) {
      const lower = matchLine.toLowerCase();
      if (lower.includes("alto risco") || lower.includes("alto")) status = "alto";
      else if (lower.includes("algumas preocupações") || lower.includes("preocupações")) status = "preocupações";
      else if (lower.includes("baixo risco") || lower.includes("baixo")) status = "baixo";
      detail = matchLine.replace(/^[^:]+:\s*/, "").trim() || matchLine;
    }
    return { ...dominio, status, detail };
  });
}

const getDomainIcon = (status: DomainStatus) => {
  switch (status) {
    case "baixo": return <CheckCircle className="h-4 w-4 shrink-0 text-grade-a-text" />;
    case "preocupações": return <AlertTriangle className="h-4 w-4 shrink-0 text-grade-b-text" />;
    case "alto": return <XCircle className="h-4 w-4 shrink-0 text-grade-d-text" />;
    default: return <HelpCircle className="h-4 w-4 shrink-0 text-muted-foreground" />;
  }
};

const RobIcon = ({ resultado }: { resultado: string }) => {
  const lower = resultado?.toLowerCase() || "";
  if (lower.includes("baixo")) return <CheckCircle className="h-4 w-4 text-grade-a-text" />;
  if (lower.includes("preocupações") || lower.includes("algumas")) return <AlertTriangle className="h-4 w-4 text-grade-b-text" />;
  return <XCircle className="h-4 w-4 text-grade-d-text" />;
};

// --- Quiz helpers ---
const letterMap: Record<string, string> = { A: "alt_a", B: "alt_b", C: "alt_c", D: "alt_d" };
const altKeys = ["alt_a", "alt_b", "alt_c", "alt_d"] as const;
const letterLabels = ["A", "B", "C", "D"];

// --- PDF extraction ---
async function extrairTextoPDF(file: File): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

  const arrayBuffer = await file.arrayBuffer();
  const typedArray = new Uint8Array(arrayBuffer);
  const pdf = await pdfjsLib.getDocument(typedArray).promise;

  let textoCompleto = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const textoPagina = textContent.items
      .map((item: any) => item.str)
      .join(" ");
    textoCompleto += textoPagina + "\n\n";
  }

  return textoCompleto.replace(/\s{3,}/g, "\n\n").trim().substring(0, 15000);
}

const UploadArtigo = () => {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [estado, setEstado] = useState<Estado>("upload");
  const [modoTexto, setModoTexto] = useState(false);
  const [textoColado, setTextoColado] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [textoExtraido, setTextoExtraido] = useState<string | null>(null);
  const [numPaginas, setNumPaginas] = useState<number | null>(null);
  const [extraindo, setExtraindo] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState(0);
  const [artigo, setArtigo] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Quiz state
  const [showQuiz, setShowQuiz] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Drag state
  const [dragOver, setDragOver] = useState(false);

  // Loading message rotation
  useEffect(() => {
    if (estado !== "processando") return;
    const interval = setInterval(() => {
      setLoadingMsg((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [estado]);

  // Rate limit check for non-logged users
  const checkRateLimit = useCallback((): boolean => {
    if (user) return true;
    const count = parseInt(sessionStorage.getItem(SESSION_KEY) || "0", 10);
    if (count >= 1) return false;
    return true;
  }, [user]);

  const incrementRateLimit = useCallback(() => {
    if (!user) {
      const count = parseInt(sessionStorage.getItem(SESSION_KEY) || "0", 10);
      sessionStorage.setItem(SESSION_KEY, String(count + 1));
    }
  }, [user]);

  const handleFileSelect = useCallback(async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Máximo 10MB.");
      return;
    }
    if (file.type !== "application/pdf") {
      toast.error("Somente arquivos PDF são aceitos.");
      return;
    }

    setArquivo(file);
    setExtraindo(true);
    setTextoExtraido(null);
    setNumPaginas(null);

    try {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument(new Uint8Array(arrayBuffer)).promise;
      setNumPaginas(pdf.numPages);

      let texto = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const tc = await page.getTextContent();
        texto += tc.items.map((item: any) => item.str).join(" ") + "\n\n";
      }
      const cleaned = texto.replace(/\s{3,}/g, "\n\n").trim().substring(0, 15000);
      setTextoExtraido(cleaned);
    } catch (e) {
      toast.error("Erro ao extrair texto do PDF.");
      console.error(e);
    } finally {
      setExtraindo(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleAnalyze = useCallback(async () => {
    if (!checkRateLimit()) {
      toast.error("Crie uma conta gratuita para analisar artigos ilimitados");
      return;
    }

    const texto = modoTexto ? textoColado : textoExtraido;
    if (!texto || texto.trim().length < 100) {
      toast.error("Texto muito curto para análise.");
      return;
    }

    setEstado("processando");
    setLoadingMsg(0);
    setErro(null);

    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const supabaseUrl = `https://${projectId}.supabase.co`;
      const res = await fetch(`${supabaseUrl}/functions/v1/analisar-upload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          texto: texto.trim().substring(0, 15000),
          fonte: modoTexto ? "texto" : "pdf",
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Erro ${res.status}`);
      }

      const data = await res.json();
      setArtigo(data.artigo);
      setEstado("resultado");
      incrementRateLimit();
    } catch (e) {
      console.error("Erro na análise:", e);
      setErro(e instanceof Error ? e.message : "Erro desconhecido");
      setEstado("upload");
      toast.error("Erro ao analisar artigo. Tente novamente.");
    }
  }, [modoTexto, textoColado, textoExtraido, checkRateLimit, incrementRateLimit]);

  const handleReset = () => {
    setEstado("upload");
    setModoTexto(false);
    setTextoColado("");
    setArquivo(null);
    setTextoExtraido(null);
    setNumPaginas(null);
    setArtigo(null);
    setErro(null);
    setShowQuiz(false);
    setSelected(null);
    setConfirmed(false);
    setSaved(false);
    setDismissed(false);
  };

  // Quiz logic
  const correctKey = artigo ? letterMap[artigo.resposta_correta?.toUpperCase() || ""] : "";
  const acertou = selected === correctKey;
  const getAltText = (key: string) => artigo?.[key] as string;

  const handleConfirmQuiz = async () => {
    setConfirmed(true);
    if (user && artigo) {
      setSaving(true);
      try {
        await supabase.from("progresso").insert({
          usuario_id: user.id,
          artigo_id: artigo.id,
          respondeu: true,
          acertou: selected === correctKey,
          data_resposta: new Date().toISOString(),
          proxima_revisao: new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
        });
        await supabase.rpc("atualizar_streak", { p_usuario_id: user.id });
        setSaved(true);
        toast.success("Progresso salvo!");
      } catch (e) {
        console.error(e);
      } finally {
        setSaving(false);
      }
    }
  };

  const handleGoogleLogin = async () => {
    setSaving(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + "/feed",
      });
      if (result.error) {
        toast.error("Erro ao fazer login com Google");
        setSaving(false);
      }
    } catch {
      toast.error("Erro ao fazer login");
      setSaving(false);
    }
  };

  // ══════════════════════════════════════════
  // ESTADO 1 — Upload
  // ══════════════════════════════════════════
  if (estado === "upload") {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="font-serif text-2xl font-semibold text-foreground mb-2" style={{ letterSpacing: '-0.02em' }}>Analisar um artigo</h1>
          <p className="text-sm text-muted-foreground">
            Faça upload de um PDF ou cole o texto do artigo
          </p>
        </div>

        {!modoTexto ? (
          <>
            {/* Drag & drop area */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
                dragOver
                  ? "border-primary bg-accent-light"
                  : "border-[hsl(var(--border))] bg-card hover:border-[hsl(40_6%_10%/0.18)]"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                }}
              />
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
              <p className="text-sm font-medium text-foreground mb-1">
                Arraste um PDF aqui ou clique para selecionar
              </p>
              <p className="text-xs text-muted-foreground">
                Máximo 10MB · Somente arquivos PDF
              </p>
            </div>

            {/* File selected preview */}
            {arquivo && (
              <div className="mt-4 rounded-lg border border-[hsl(var(--border))] bg-card p-4">
                <div className="flex items-center gap-3 mb-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{arquivo.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(arquivo.size / 1024 / 1024).toFixed(1)} MB
                      {numPaginas !== null && ` · ${numPaginas} páginas`}
                    </p>
                  </div>
                </div>

                {extraindo && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Extraindo texto...
                  </div>
                )}

                {textoExtraido !== null && !extraindo && (
                  <>
                    {textoExtraido.length < 200 ? (
                      <div className="flex items-start gap-2 mt-2 p-2 rounded bg-grade-b-bg border border-grade-b-text/20">
                        <AlertTriangle className="h-4 w-4 text-grade-b-text shrink-0 mt-0.5" />
                        <p className="text-xs text-grade-b-text">
                          Este PDF parece ser uma imagem escaneada. A extração de texto pode ser limitada. Considere colar o texto manualmente.
                        </p>
                      </div>
                    ) : (
                      <div className="mt-2">
                        <p className="text-xs text-muted-foreground mb-1">Preview do texto extraído:</p>
                        <p className="text-xs text-foreground/70 bg-muted/50 rounded p-2 line-clamp-3">
                          {textoExtraido.substring(0, 300)}...
                        </p>
                      </div>
                    )}

                    <button
                      onClick={handleAnalyze}
                      disabled={textoExtraido.length < 100}
                      className="mt-4 w-full rounded-md bg-primary py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      Analisar →
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Toggle to text mode */}
            <button
              onClick={() => setModoTexto(true)}
              className="block mx-auto mt-6 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Prefiro colar o texto do artigo
            </button>
          </>
        ) : (
          <>
            {/* Text paste area */}
            <textarea
              value={textoColado}
              onChange={(e) => setTextoColado(e.target.value)}
              placeholder="Cole aqui o texto do artigo — abstract, métodos, resultados, discussão..."
              className="w-full h-64 rounded-lg border border-border bg-card p-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-muted-foreground">
                {textoColado.length > 0 ? `${textoColado.length} caracteres` : ""}
              </p>
              <button
                onClick={() => { setModoTexto(false); setTextoColado(""); }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Voltar ao upload de PDF
              </button>
            </div>
            <button
              onClick={handleAnalyze}
              disabled={textoColado.trim().length < 100}
              className="mt-4 w-full rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              Analisar →
            </button>
          </>
        )}

        {erro && (
          <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
            <p className="text-sm text-destructive">{erro}</p>
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════
  // ESTADO 2 — Processando
  // ══════════════════════════════════════════
  if (estado === "processando") {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <Loader2 className="h-10 w-10 mx-auto text-primary animate-spin mb-6" />
        <p className="text-sm font-medium text-foreground mb-2">
          {LOADING_MESSAGES[loadingMsg]}
        </p>
        <p className="text-xs text-muted-foreground">
          Isso pode levar até 30 segundos
        </p>
      </div>
    );
  }

  // ══════════════════════════════════════════
  // ESTADO 3 — Resultado
  // ══════════════════════════════════════════
  if (!artigo) return null;

  const viesesDetalhados = artigo.vieses_detalhados as string | null;
  const limitacoesAutores = artigo.limitacoes_autores as string | null;
  const conflitosInteresse = artigo.conflitos_interesse as string | null;
  const dominiosRob = viesesDetalhados ? parseViesesDetalhados(viesesDetalhados) : null;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Upload badge */}
      <div className="mb-4">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
          📄 Artigo enviado por você · Análise do texto completo
        </span>
      </div>

      <div className="mb-4">
        <GradeBadge grade={artigo.grade || ""} size="lg" />
      </div>

      <h1 className="text-2xl font-bold text-foreground leading-tight mb-4">
        {artigo.titulo}
      </h1>

      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mb-8">
        {artigo.journal && (
          <>
            <span className="font-mono text-xs uppercase tracking-wider">{artigo.journal}</span>
            <span>·</span>
          </>
        )}
        {artigo.ano && <span>{artigo.ano}</span>}
        {artigo.tipo_estudo && (
          <>
            <span>·</span>
            <span>{artigo.tipo_estudo}</span>
          </>
        )}
      </div>

      {/* Resumo */}
      <section className="mb-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Resumo</h2>
        <p className="text-sm leading-relaxed text-foreground/90">{artigo.resumo_pt}</p>
      </section>

      {/* Acordeões */}
      <Accordion type="multiple" className="mb-8">
        <AccordionItem value="metodologia" className="border-border">
          <AccordionTrigger className="text-sm font-medium text-foreground hover:no-underline">
            Análise metodológica
          </AccordionTrigger>
          <AccordionContent>
            <div className="mb-4">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                <FileText className="h-3 w-3" />
                Análise do texto completo
              </span>
            </div>

            <p className="text-sm text-foreground/80 leading-relaxed mb-4">
              {artigo.analise_metodologica}
            </p>

            {artigo.rob_resultado && (
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 mb-4">
                <RobIcon resultado={artigo.rob_resultado} />
                <span className="text-sm font-medium text-foreground">
                  Risco de viés: {artigo.rob_resultado}
                </span>
              </div>
            )}

            {dominiosRob && (
              <Accordion type="single" collapsible className="mb-3">
                <AccordionItem value="vieses" className="border-border/50">
                  <AccordionTrigger className="text-xs font-medium text-muted-foreground hover:text-foreground hover:no-underline py-2">
                    Ver análise de vieses por domínio
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3 pt-1">
                      {dominiosRob.map((d) => (
                        <div key={d.id} className="flex items-start gap-2.5">
                          {getDomainIcon(d.status)}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground leading-tight">{d.id} · {d.label}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{d.detail}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}

            {limitacoesAutores && (
              <Accordion type="single" collapsible className="mb-3">
                <AccordionItem value="limitacoes" className="border-border/50">
                  <AccordionTrigger className="text-xs font-medium text-muted-foreground hover:text-foreground hover:no-underline py-2">
                    Ver limitações declaradas pelos autores
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className="text-sm text-foreground/80 leading-relaxed">{limitacoesAutores}</p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}

            {conflitosInteresse && (
              <Accordion type="single" collapsible>
                <AccordionItem value="conflitos" className="border-border/50">
                  <AccordionTrigger className="text-xs font-medium text-muted-foreground hover:text-foreground hover:no-underline py-2">
                    Conflitos de interesse
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className="text-sm text-foreground/80 leading-relaxed">{conflitosInteresse}</p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}
          </AccordionContent>
        </AccordionItem>

        {artigo.contexto_vs_anterior && (
          <AccordionItem value="contexto" className="border-border">
            <AccordionTrigger className="text-sm font-medium text-foreground hover:no-underline">
              O que mudou em relação ao que já se sabia
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-sm text-foreground/80 leading-relaxed">{artigo.contexto_vs_anterior}</p>
            </AccordionContent>
          </AccordionItem>
        )}
      </Accordion>

      {/* Quiz section */}
      {!showQuiz && artigo.questao && (
        <div className="flex flex-col gap-3 mb-8">
          <button
            onClick={() => setShowQuiz(true)}
            className="w-full rounded-lg bg-primary py-3.5 text-center text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Responder questão →
          </button>
          <div className="flex gap-3">
            {artigo.id && (
              <Link
                to={`/artigo/${artigo.id}`}
                className="flex-1 rounded-lg border border-border py-2.5 text-center text-sm font-medium text-muted-foreground hover:text-foreground hover:border-muted-foreground/50 transition-colors"
              >
                Ver no feed
              </Link>
            )}
            <button
              onClick={handleReset}
              className="flex-1 rounded-lg border border-border py-2.5 text-center text-sm font-medium text-muted-foreground hover:text-foreground hover:border-muted-foreground/50 transition-colors"
            >
              Analisar outro artigo
            </button>
          </div>
        </div>
      )}

      {showQuiz && artigo.questao && (
        <div className="mb-8">
          <div className="mb-4">
            <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Questão clínica</span>
            <p className="mt-2 text-base font-medium text-foreground leading-relaxed">{artigo.questao}</p>
          </div>

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
                      onClick={() => setSelected(key)}
                      className={`w-full text-left rounded-lg border px-4 py-3 text-sm transition-colors ${
                        isSelected
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-card text-foreground/80 hover:border-muted-foreground/30"
                      }`}
                    >
                      <span className="font-mono font-semibold mr-2 text-muted-foreground">{letterLabels[i]}.</span>
                      {text}
                    </button>
                  );
                })}
              </div>
              {selected && (
                <button
                  onClick={handleConfirmQuiz}
                  className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Confirmar resposta
                </button>
              )}
            </>
          ) : (
            <>
              {acertou ? (
                <div className="rounded-lg bg-primary/15 border border-primary/30 px-4 py-3 mb-6">
                  <span className="text-sm font-semibold text-primary">✓ Correto!</span>
                </div>
              ) : (
                <div className="rounded-lg bg-grade-b-bg border border-grade-b-text/30 px-4 py-3 mb-6">
                  <span className="text-sm font-semibold text-grade-b-text">
                    ✗ A resposta correta era {artigo.resposta_correta}: {getAltText(correctKey)}
                  </span>
                </div>
              )}

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
                      <span className="font-mono font-semibold mr-2 text-muted-foreground">{letterLabels[i]}.</span>
                      {text}
                    </div>
                  );
                })}
              </div>

              <div className="rounded-lg border border-border bg-card p-5 mb-6">
                <p className="text-sm leading-relaxed text-foreground/90">{artigo.feedback_quiz}</p>
              </div>

              {saved ? (
                <div className="text-center space-y-4">
                  <p className="text-sm text-primary font-medium">✓ Progresso salvo!</p>
                  <button onClick={handleReset} className="text-sm text-muted-foreground hover:text-foreground">
                    Analisar outro artigo
                  </button>
                </div>
              ) : dismissed ? (
                <div className="text-center">
                  <button onClick={handleReset} className="text-sm text-muted-foreground hover:text-foreground">
                    Analisar outro artigo
                  </button>
                </div>
              ) : user ? (
                <div className="text-center">
                  {saving && <p className="text-sm text-muted-foreground">Salvando progresso...</p>}
                </div>
              ) : (
                <div className="rounded-lg border border-primary/20 bg-card p-6 text-center">
                  <h3 className="text-lg font-semibold text-foreground mb-1">Salve seu progresso</h3>
                  <p className="text-sm text-muted-foreground mb-5">
                    Crie sua conta gratuita para acompanhar sua evolução
                  </p>
                  <button
                    onClick={handleGoogleLogin}
                    disabled={saving}
                    className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 mb-3"
                  >
                    {saving ? "Entrando..." : "Entrar com Google →"}
                  </button>
                  <button onClick={() => setDismissed(true)} className="text-xs text-muted-foreground hover:text-foreground">
                    Continuar sem salvar
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default UploadArtigo;
