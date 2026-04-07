import { CheckCircle, AlertTriangle, XCircle, HelpCircle, FileText, FileSearch } from "lucide-react";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ArtigoData } from "./types";
import { parseViesesDetalhados, detectConflito, isRCT, isRevisao } from "./utils";
import type { DomainStatus } from "./types";

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

const getAmstarBadge = (classificacao: string) => {
  const l = classificacao.toLowerCase();
  if (l.includes("alta")) return { bg: "bg-grade-a-bg", text: "text-grade-a-text" };
  if (l.includes("moderada")) return { bg: "bg-grade-b-bg", text: "text-grade-b-text" };
  if (l.includes("baixa") && !l.includes("criticamente")) return { bg: "bg-[hsl(25,80%,93%)]", text: "text-[hsl(25,70%,30%)]" };
  return { bg: "bg-grade-d-bg", text: "text-grade-d-text" };
};

interface Props { artigo: ArtigoData; }

const AvaliacaoQualidade = ({ artigo }: Props) => {
  const temTextoCompleto = artigo.tem_texto_completo === true;
  const tipo = artigo.tipo_estudo as string | null;
  const ehRCT = isRCT(tipo);
  const ehRevisao = isRevisao(tipo);

  const dominiosRob = artigo.vieses_detalhados ? parseViesesDetalhados(artigo.vieses_detalhados) : null;
  const conflitoStatus = artigo.conflitos_interesse ? detectConflito(artigo.conflitos_interesse) : null;

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-[0.68rem] font-medium uppercase tracking-[0.1em] text-muted-foreground">
          Avaliação da qualidade
        </h2>
        {temTextoCompleto ? (
          <span className="inline-flex items-center gap-1.5 rounded px-2.5 py-0.5 text-[0.65rem] font-medium bg-grade-a-bg text-grade-a-text">
            <FileText className="h-3 w-3" />
            Texto completo
          </span>
        ) : (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1.5 rounded px-2.5 py-0.5 text-[0.65rem] font-medium bg-muted text-muted-foreground cursor-help">
                  <FileSearch className="h-3 w-3" />
                  Abstract
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                Análise baseada no resumo — alguns domínios podem não ter sido avaliados
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      <Accordion type="multiple" className="">
        {/* === RCT-specific === */}
        {ehRCT && artigo.rob_resultado && (
          <AccordionItem value="rob2" className="border-[hsl(var(--border))]">
            <AccordionTrigger className="text-[0.9rem] font-medium text-foreground hover:no-underline">
              <span className="flex items-center gap-2">
                RoB 2 — Risco de Viés
                <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[0.65rem] font-medium bg-muted text-muted-foreground">
                  <RobIcon resultado={artigo.rob_resultado} />
                  {artigo.rob_resultado}
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="bg-surface-secondary rounded-b-lg px-4 py-4 border-l-2 border-primary">
              {dominiosRob && (
                <div className="space-y-3">
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
              )}
            </AccordionContent>
          </AccordionItem>
        )}

        {ehRCT && artigo.jadad_score != null && (
          <AccordionItem value="jadad" className="border-[hsl(var(--border))]">
            <AccordionTrigger className="text-[0.9rem] font-medium text-foreground hover:no-underline">
              <span className="flex items-center gap-2">
                Jadad Scale
                <span className={`inline-flex items-center rounded px-2 py-0.5 text-[0.65rem] font-medium ${
                  artigo.jadad_score >= 3 ? "bg-grade-a-bg text-grade-a-text" : "bg-grade-b-bg text-grade-b-text"
                }`}>
                  {artigo.jadad_score}/5 · {artigo.jadad_score >= 3 ? "Boa qualidade" : "Qualidade limitada"}
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="bg-surface-secondary rounded-b-lg px-4 py-4 border-l-2 border-primary">
              <p className="text-[0.88rem] text-foreground/80 leading-[1.72]">{artigo.jadad_justificativa}</p>
            </AccordionContent>
          </AccordionItem>
        )}

        {/* === Revisão-specific === */}
        {ehRevisao && artigo.amstar2_classificacao && (
          <AccordionItem value="amstar2" className="border-[hsl(var(--border))]">
            <AccordionTrigger className="text-[0.9rem] font-medium text-foreground hover:no-underline">
              <span className="flex items-center gap-2">
                AMSTAR 2
                {(() => {
                  const badge = getAmstarBadge(artigo.amstar2_classificacao);
                  return (
                    <span className={`inline-flex items-center rounded px-2 py-0.5 text-[0.65rem] font-medium ${badge.bg} ${badge.text}`}>
                      {artigo.amstar2_classificacao}
                    </span>
                  );
                })()}
              </span>
            </AccordionTrigger>
            <AccordionContent className="bg-surface-secondary rounded-b-lg px-4 py-4 border-l-2 border-primary">
              <p className="text-[0.88rem] text-foreground/80 leading-[1.72]">{artigo.amstar2_justificativa}</p>
            </AccordionContent>
          </AccordionItem>
        )}

        {ehRevisao && artigo.robis_resultado && (
          <AccordionItem value="robis" className="border-[hsl(var(--border))]">
            <AccordionTrigger className="text-[0.9rem] font-medium text-foreground hover:no-underline">
              <span className="flex items-center gap-2">
                ROBIS — Risco de Viés da Revisão
                <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[0.65rem] font-medium bg-muted text-muted-foreground">
                  <RobIcon resultado={artigo.robis_resultado} />
                  {artigo.robis_resultado}
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="bg-surface-secondary rounded-b-lg px-4 py-4 border-l-2 border-primary">
              <p className="text-[0.88rem] text-foreground/80 leading-[1.72]">{artigo.robis_justificativa}</p>
            </AccordionContent>
          </AccordionItem>
        )}

        {ehRevisao && artigo.grade && (
          <AccordionItem value="grade-evidencia" className="border-[hsl(var(--border))]">
            <AccordionTrigger className="text-[0.9rem] font-medium text-foreground hover:no-underline">
              <span className="flex items-center gap-2">
                GRADE da Evidência
                {(() => {
                  const g = artigo.grade?.toLowerCase() || "";
                  let cls = "bg-grade-c-bg text-grade-c-text";
                  if (g.includes("alto")) cls = "bg-grade-a-bg text-grade-a-text";
                  else if (g.includes("moderado")) cls = "bg-grade-b-bg text-grade-b-text";
                  else if (g.includes("muito baixo")) cls = "bg-grade-d-bg text-grade-d-text";
                  return <span className={`inline-flex items-center rounded px-2 py-0.5 text-[0.65rem] font-medium ${cls}`}>{artigo.grade}</span>;
                })()}
              </span>
            </AccordionTrigger>
            <AccordionContent className="bg-surface-secondary rounded-b-lg px-4 py-4 border-l-2 border-primary">
              <p className="text-[0.88rem] text-foreground/80 leading-[1.72]">{artigo.grade_justificativa}</p>
            </AccordionContent>
          </AccordionItem>
        )}

        {/* === CASP (RCT + Revisão) === */}
        {(ehRCT || ehRevisao) && artigo.casp_resumo && (
          <AccordionItem value="casp" className="border-[hsl(var(--border))]">
            <AccordionTrigger className="text-[0.9rem] font-medium text-foreground hover:no-underline">
              Avaliação CASP
            </AccordionTrigger>
            <AccordionContent className="bg-surface-secondary rounded-b-lg px-4 py-4 border-l-2 border-primary">
              <p className="text-[0.88rem] text-foreground/80 leading-[1.72]">{artigo.casp_resumo}</p>
            </AccordionContent>
          </AccordionItem>
        )}

        {/* === Sempre visíveis === */}
        {artigo.analise_metodologica && (
          <AccordionItem value="analise-critica" className="border-[hsl(var(--border))]">
            <AccordionTrigger className="text-[0.9rem] font-medium text-foreground hover:no-underline">
              Análise crítica independente
            </AccordionTrigger>
            <AccordionContent className="bg-surface-secondary rounded-b-lg px-4 py-4 border-l-2 border-primary">
              <p className="text-[0.88rem] text-foreground/80 leading-[1.72]">{artigo.analise_metodologica}</p>
            </AccordionContent>
          </AccordionItem>
        )}

        {artigo.limitacoes_autores && (
          <AccordionItem value="limitacoes" className="border-[hsl(var(--border))]">
            <AccordionTrigger className="text-[0.9rem] font-medium text-foreground hover:no-underline">
              Limitações declaradas pelos autores
            </AccordionTrigger>
            <AccordionContent className="bg-surface-secondary rounded-b-lg px-4 py-4 border-l-2 border-primary">
              <p className="text-[0.88rem] text-foreground/80 leading-[1.72]">{artigo.limitacoes_autores}</p>
            </AccordionContent>
          </AccordionItem>
        )}

        {artigo.conflitos_interesse && (
          <AccordionItem value="conflitos" className="border-[hsl(var(--border))]">
            <AccordionTrigger className="text-[0.9rem] font-medium text-foreground hover:no-underline">
              Conflitos de interesse
            </AccordionTrigger>
            <AccordionContent className="bg-surface-secondary rounded-b-lg px-4 py-4 border-l-2 border-primary">
              <div className="flex items-start gap-2">
                {conflitoStatus === "ausente" ? (
                  <CheckCircle className="h-4 w-4 shrink-0 text-grade-a-text mt-0.5" />
                ) : (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-grade-b-text mt-0.5" />
                )}
                <p className="text-[0.88rem] text-foreground/80 leading-[1.72]">{artigo.conflitos_interesse}</p>
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {artigo.contexto_vs_anterior && (
          <AccordionItem value="contexto" className="border-[hsl(var(--border))]">
            <AccordionTrigger className="text-[0.9rem] font-medium text-foreground hover:no-underline">
              Contexto na evidência
            </AccordionTrigger>
            <AccordionContent className="bg-surface-secondary rounded-b-lg px-4 py-4 border-l-2 border-primary">
              <p className="text-[0.88rem] text-foreground/80 leading-[1.72]">{artigo.contexto_vs_anterior}</p>
            </AccordionContent>
          </AccordionItem>
        )}
      </Accordion>
    </section>
  );
};

export default AvaliacaoQualidade;
