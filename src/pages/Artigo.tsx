import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ExternalLink, ChevronLeft, CheckCircle, AlertTriangle, XCircle, HelpCircle, FileText, FileSearch } from "lucide-react";
import Header from "@/components/Header";
import GradeBadge from "@/components/GradeBadge";
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

const RobIcon = ({ resultado }: { resultado: string }) => {
  const lower = resultado?.toLowerCase() || "";
  if (lower.includes("baixo")) return <CheckCircle className="h-4 w-4 text-primary" />;
  if (lower.includes("preocupações") || lower.includes("algumas")) return <AlertTriangle className="h-4 w-4 text-grade-b-text" />;
  return <XCircle className="h-4 w-4 text-destructive" />;
};

type DomainStatus = "baixo" | "preocupações" | "alto" | "nao_avaliado";

interface RobDomain {
  id: string;
  label: string;
  status: DomainStatus;
  detail: string;
}

const getDomainIcon = (status: DomainStatus) => {
  switch (status) {
    case "baixo":
      return <CheckCircle className="h-4 w-4 shrink-0 text-primary" />;
    case "preocupações":
      return <AlertTriangle className="h-4 w-4 shrink-0 text-grade-b-text" />;
    case "alto":
      return <XCircle className="h-4 w-4 shrink-0 text-destructive" />;
    default:
      return <HelpCircle className="h-4 w-4 shrink-0 text-muted-foreground" />;
  }
};

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
      if (lower.includes("alto risco") || lower.includes("alto")) {
        status = "alto";
      } else if (lower.includes("algumas preocupações") || lower.includes("preocupações") || lower.includes("preocupacoes")) {
        status = "preocupações";
      } else if (lower.includes("baixo risco") || lower.includes("baixo")) {
        status = "baixo";
      }
      detail = matchLine.replace(/^[^:]+:\s*/, "").trim() || matchLine;
    }
    
    return { ...dominio, status, detail };
  });
}

function detectConflito(texto: string): "ausente" | "presente" {
  const lower = texto.toLowerCase();
  if (
    lower.includes("nenhum conflito") ||
    lower.includes("sem conflito") ||
    lower.includes("ausência de conflito") ||
    lower.includes("não declararam conflito") ||
    lower.includes("não reportaram conflito") ||
    lower.includes("nothing to disclose") ||
    lower.includes("no conflicts")
  ) {
    return "ausente";
  }
  return "presente";
}

const Artigo = () => {
  const { id } = useParams<{ id: string }>();

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

  const temTextoCompleto = (artigo as any).tem_texto_completo === true;
  const viesesDetalhados = (artigo as any).vieses_detalhados as string | null;
  const limitacoesAutores = (artigo as any).limitacoes_autores as string | null;
  const conflitosInteresse = (artigo as any).conflitos_interesse as string | null;

  const dominiosRob = viesesDetalhados ? parseViesesDetalhados(viesesDetalhados) : null;
  const conflitoStatus = conflitosInteresse ? detectConflito(conflitosInteresse) : null;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container max-w-3xl py-8">
        <Link
          to="/feed"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ChevronLeft className="h-4 w-4" /> Feed
        </Link>

        <div className="mb-4">
          <GradeBadge grade={artigo.grade || ""} size="lg" />
        </div>

        <h1 className="text-2xl font-bold text-foreground leading-tight mb-4">
          {artigo.titulo}
        </h1>

        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mb-8">
          <span className="font-mono text-xs uppercase tracking-wider">
            {artigo.journal}
          </span>
          <span>·</span>
          <span>{artigo.ano}</span>
          <span>·</span>
          <span>{artigo.citacoes} citações</span>
          {artigo.link_original && (
            <>
              <span>·</span>
              <button
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = artigo.link_original!;
                  a.target = "_blank";
                  a.rel = "noopener noreferrer";
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                }}
                className="inline-flex items-center gap-1 text-secondary hover:underline"
              >
                Ver artigo original <ExternalLink className="h-3 w-3" />
              </button>
            </>
          )}
        </div>

        {/* Resumo */}
        <section className="mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Resumo
          </h2>
          <p className="text-sm leading-relaxed text-foreground/90">
            {artigo.resumo_pt}
          </p>
        </section>

        {/* Acordeões */}
        <Accordion type="multiple" className="mb-8">
          <AccordionItem value="metodologia" className="border-border">
            <AccordionTrigger className="text-sm font-medium text-foreground hover:no-underline">
              Análise metodológica
            </AccordionTrigger>
            <AccordionContent>
              {/* Badge de fonte da análise */}
              <div className="mb-4">
                {temTextoCompleto ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    <FileText className="h-3 w-3" />
                    Análise do texto completo
                  </span>
                ) : (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground cursor-help">
                          <FileSearch className="h-3 w-3" />
                          Análise do abstract
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs text-xs">
                        Análise baseada no resumo — alguns domínios podem não ter sido avaliados por falta de informação
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>

              <p className="text-sm text-foreground/80 leading-relaxed mb-4">
                {artigo.analise_metodologica}
              </p>

              {/* Badge principal de RoB */}
              {artigo.rob_resultado && (
                <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 mb-4">
                  <RobIcon resultado={artigo.rob_resultado} />
                  <span className="text-sm font-medium text-foreground">
                    Risco de viés: {artigo.rob_resultado}
                  </span>
                </div>
              )}

              {/* Vieses detalhados por domínio RoB 2 */}
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
                              <p className="text-sm font-medium text-foreground leading-tight">
                                {d.id} · {d.label}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                                {d.detail}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}

              {/* Limitações dos autores */}
              {limitacoesAutores && (
                <Accordion type="single" collapsible className="mb-3">
                  <AccordionItem value="limitacoes" className="border-border/50">
                    <AccordionTrigger className="text-xs font-medium text-muted-foreground hover:text-foreground hover:no-underline py-2">
                      Ver limitações declaradas pelos autores
                    </AccordionTrigger>
                    <AccordionContent>
                      <p className="text-sm text-foreground/80 leading-relaxed">
                        {limitacoesAutores}
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}

              {/* Conflitos de interesse */}
              {conflitosInteresse && (
                <Accordion type="single" collapsible>
                  <AccordionItem value="conflitos" className="border-border/50">
                    <AccordionTrigger className="text-xs font-medium text-muted-foreground hover:text-foreground hover:no-underline py-2">
                      Conflitos de interesse
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="flex items-start gap-2">
                        {conflitoStatus === "ausente" ? (
                          <CheckCircle className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 shrink-0 text-grade-b-text mt-0.5" />
                        )}
                        <p className="text-sm text-foreground/80 leading-relaxed">
                          {conflitosInteresse}
                        </p>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="contexto" className="border-border">
            <AccordionTrigger className="text-sm font-medium text-foreground hover:no-underline">
              O que mudou em relação ao que já se sabia
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-sm text-foreground/80 leading-relaxed">
                {artigo.contexto_vs_anterior}
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* CTA */}
        <Link
          to={`/quiz/${artigo.id}`}
          className="block w-full rounded-lg bg-primary py-3.5 text-center text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Responder questão clínica →
        </Link>
      </main>
    </div>
  );
};

export default Artigo;
