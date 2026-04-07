import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import type { ArtigoData } from "./types";

interface Props { artigo: ArtigoData; }

const AnaliseEstudo = ({ artigo }: Props) => {
  const tipoEstudo = artigo.tipo_estudo;
  const ferramentas = artigo.ferramentas_usadas;
  const hasContent = artigo.introducao_resumo || artigo.metodologia_detalhada || artigo.resultados_principais || artigo.conclusao_autores;

  if (!hasContent) return null;

  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-[0.68rem] font-medium uppercase tracking-[0.1em] text-muted-foreground">
          Análise do estudo
        </h2>
        {tipoEstudo && (
          <span className="inline-flex items-center rounded px-2 py-0.5 text-[0.65rem] font-medium bg-primary/10 text-primary">
            {tipoEstudo}
          </span>
        )}
        {ferramentas && (
          <span className="inline-flex items-center rounded px-2 py-0.5 text-[0.65rem] font-medium bg-muted text-muted-foreground">
            {ferramentas}
          </span>
        )}
      </div>

      <Accordion type="multiple" className="">
        {artigo.introducao_resumo && (
          <AccordionItem value="introducao" className="border-[hsl(var(--border))]">
            <AccordionTrigger className="text-[0.9rem] font-medium text-foreground hover:no-underline">
              Introdução e contexto
            </AccordionTrigger>
            <AccordionContent className="bg-surface-secondary rounded-b-lg px-4 py-4 border-l-2 border-primary">
              <p className="text-[0.88rem] text-foreground/80 leading-[1.72]">{artigo.introducao_resumo}</p>
            </AccordionContent>
          </AccordionItem>
        )}

        {artigo.metodologia_detalhada && (
          <AccordionItem value="metodologia" className="border-[hsl(var(--border))]">
            <AccordionTrigger className="text-[0.9rem] font-medium text-foreground hover:no-underline">
              Metodologia
            </AccordionTrigger>
            <AccordionContent className="bg-surface-secondary rounded-b-lg px-4 py-4 border-l-2 border-primary">
              <p className="text-[0.88rem] text-foreground/80 leading-[1.72]">{artigo.metodologia_detalhada}</p>
            </AccordionContent>
          </AccordionItem>
        )}

        {artigo.resultados_principais && (
          <AccordionItem value="resultados" className="border-[hsl(var(--border))]">
            <AccordionTrigger className="text-[0.9rem] font-medium text-foreground hover:no-underline">
              Resultados
            </AccordionTrigger>
            <AccordionContent className="bg-surface-secondary rounded-b-lg px-4 py-4 border-l-2 border-primary">
              <p className="text-[0.88rem] text-foreground/80 leading-[1.72]">{artigo.resultados_principais}</p>
            </AccordionContent>
          </AccordionItem>
        )}

        {(artigo.conclusao_autores || artigo.implicacao_clinica) && (
          <AccordionItem value="conclusao" className="border-[hsl(var(--border))]">
            <AccordionTrigger className="text-[0.9rem] font-medium text-foreground hover:no-underline">
              Conclusão e implicação clínica
            </AccordionTrigger>
            <AccordionContent className="bg-surface-secondary rounded-b-lg px-4 py-4 border-l-2 border-primary">
              {artigo.conclusao_autores && (
                <p className="text-[0.88rem] text-foreground/80 leading-[1.72]">{artigo.conclusao_autores}</p>
              )}
              {artigo.implicacao_clinica && (
                <div className="mt-3 rounded-md bg-[hsl(var(--accent-light))] border border-accent/20 px-3 py-2">
                  <p className="text-xs font-medium text-[hsl(var(--accent-mid))] uppercase tracking-wider mb-1">
                    💡 Impacto na prática
                  </p>
                  <p className="text-sm text-foreground/80">{artigo.implicacao_clinica}</p>
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        )}
      </Accordion>
    </section>
  );
};

export default AnaliseEstudo;
