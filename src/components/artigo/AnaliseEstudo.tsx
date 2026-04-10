import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import type { ArtigoData } from "./types";

interface Props { artigo: ArtigoData; }

const LabeledItem = ({ label, value }: { label: string; value?: string | null }) => {
  if (!value) return null;
  return (
    <div className="py-1.5">
      <span className="text-[0.85rem] font-semibold text-foreground">{label}: </span>
      <span className="text-[0.85rem] text-foreground/80 leading-[1.72]">{value}</span>
    </div>
  );
};

const AnaliseEstudo = ({ artigo }: Props) => {
  const ac = artigo.analise_completa as Record<string, any> | null;
  const met = ac?.metodologia;
  const res = ac?.resultados;
  const conc = ac?.conclusao;

  const tipoEstudo = artigo.tipo_estudo;
  const ferramentas = artigo.ferramentas_usadas;

  // Determine content availability
  const hasStructured = !!ac;
  const hasFlat = artigo.introducao_resumo || artigo.metodologia_detalhada || artigo.resultados_principais || artigo.conclusao_autores;

  if (!hasStructured && !hasFlat) return null;

  // Intro content
  const introContent = hasStructured
    ? [met?.populacao?.descricao, artigo.introducao_resumo].filter(Boolean).join("\n\n")
    : artigo.introducao_resumo;

  // Conclusao content
  const conclusaoContent = hasStructured
    ? conc
    : null;

  const desfechosSecundarios = res?.desfechos_secundarios as Array<{ nome: string; resultado: string; interpretacao: string }> | null;

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
        {/* INTRODUÇÃO */}
        {introContent && (
          <AccordionItem value="introducao" className="border-[hsl(var(--border))]">
            <AccordionTrigger className="text-[0.9rem] font-medium text-foreground hover:no-underline">
              Introdução e contexto
            </AccordionTrigger>
            <AccordionContent className="bg-surface-secondary rounded-b-lg px-4 py-4 border-l-2 border-primary">
              <p className="text-[0.88rem] text-foreground/80 leading-[1.72] whitespace-pre-line">{introContent}</p>
            </AccordionContent>
          </AccordionItem>
        )}

        {/* METODOLOGIA */}
        {(hasStructured && met) ? (
          <AccordionItem value="metodologia" className="border-[hsl(var(--border))]">
            <AccordionTrigger className="text-[0.9rem] font-medium text-foreground hover:no-underline">
              Metodologia
            </AccordionTrigger>
            <AccordionContent className="bg-surface-secondary rounded-b-lg px-4 py-4 border-l-2 border-primary">
              <div className="space-y-0.5">
                <LabeledItem label="Delineamento" value={met.delineamento} />
                <LabeledItem label="População (n)" value={met.populacao?.n_total} />
                <LabeledItem label="Características basais" value={met.populacao?.caracteristicas_basais} />
                <LabeledItem label="Critérios de inclusão" value={met.populacao?.criterios_inclusao} />
                <LabeledItem label="Critérios de exclusão" value={met.populacao?.criterios_exclusao} />
                <LabeledItem label="Intervenção" value={met.intervencao} />
                <LabeledItem label="Comparador" value={met.comparador} />
                <LabeledItem label="Desfecho primário" value={met.desfecho_primario} />
                <LabeledItem label="Desfechos secundários" value={met.desfechos_secundarios} />
                <LabeledItem label="Seguimento" value={met.seguimento} />
                <LabeledItem label="Randomização" value={met.randomizacao} />
                <LabeledItem label="Análise estatística" value={met.analise_estatistica} />
              </div>
            </AccordionContent>
          </AccordionItem>
        ) : artigo.metodologia_detalhada ? (
          <AccordionItem value="metodologia" className="border-[hsl(var(--border))]">
            <AccordionTrigger className="text-[0.9rem] font-medium text-foreground hover:no-underline">
              Metodologia
            </AccordionTrigger>
            <AccordionContent className="bg-surface-secondary rounded-b-lg px-4 py-4 border-l-2 border-primary">
              <p className="text-[0.88rem] text-foreground/80 leading-[1.72]">{artigo.metodologia_detalhada}</p>
            </AccordionContent>
          </AccordionItem>
        ) : null}

        {/* RESULTADOS */}
        {(hasStructured && res) ? (
          <AccordionItem value="resultados" className="border-[hsl(var(--border))]">
            <AccordionTrigger className="text-[0.9rem] font-medium text-foreground hover:no-underline">
              Resultados
            </AccordionTrigger>
            <AccordionContent className="bg-surface-secondary rounded-b-lg px-4 py-4 border-l-2 border-primary">
              <div className="space-y-0.5">
                {res.desfecho_primario && (
                  <>
                    <LabeledItem label="Desfecho primário — Intervenção" value={res.desfecho_primario.grupo_intervencao} />
                    <LabeledItem label="Desfecho primário — Controle" value={res.desfecho_primario.grupo_controle} />
                    <LabeledItem label="Estimativa" value={res.desfecho_primario.estimativa} />
                    <LabeledItem label="Interpretação" value={res.desfecho_primario.interpretacao} />
                  </>
                )}

                {desfechosSecundarios && desfechosSecundarios.length > 0 && (
                  <div className="pt-2">
                    <p className="text-[0.85rem] font-semibold text-foreground mb-1">Desfechos secundários:</p>
                    <div className="space-y-2 pl-3 border-l border-border">
                      {desfechosSecundarios.map((d, i) => (
                        <div key={i}>
                          <p className="text-[0.83rem] font-medium text-foreground">{d.nome}</p>
                          {d.resultado && <p className="text-[0.82rem] text-foreground/70">{d.resultado}</p>}
                          {d.interpretacao && <p className="text-[0.82rem] text-foreground/60 italic">{d.interpretacao}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {res.seguranca && (
                  <>
                    <LabeledItem label="Eventos adversos" value={res.seguranca.eventos_adversos_principais} />
                    <LabeledItem label="Descontinuações" value={res.seguranca.descontinuacoes} />
                  </>
                )}
                <LabeledItem label="Análises pré-especificadas" value={res.analises_pre_especificadas} />
              </div>
            </AccordionContent>
          </AccordionItem>
        ) : artigo.resultados_principais ? (
          <AccordionItem value="resultados" className="border-[hsl(var(--border))]">
            <AccordionTrigger className="text-[0.9rem] font-medium text-foreground hover:no-underline">
              Resultados
            </AccordionTrigger>
            <AccordionContent className="bg-surface-secondary rounded-b-lg px-4 py-4 border-l-2 border-primary">
              <p className="text-[0.88rem] text-foreground/80 leading-[1.72]">{artigo.resultados_principais}</p>
            </AccordionContent>
          </AccordionItem>
        ) : null}

        {/* CONCLUSÃO */}
        {(hasStructured && conc) ? (
          <AccordionItem value="conclusao" className="border-[hsl(var(--border))]">
            <AccordionTrigger className="text-[0.9rem] font-medium text-foreground hover:no-underline">
              Conclusão e implicação clínica
            </AccordionTrigger>
            <AccordionContent className="bg-surface-secondary rounded-b-lg px-4 py-4 border-l-2 border-primary">
              <div className="space-y-0.5">
                <LabeledItem label="Conclusão dos autores" value={conc.conclusao_dos_autores} />
                {conc.implicacao_clinica && (
                  <div className="mt-3 rounded-md bg-[hsl(var(--accent-light))] border border-accent/20 px-3 py-2">
                    <p className="text-xs font-medium text-[hsl(var(--accent-mid))] uppercase tracking-wider mb-1">
                      💡 Impacto na prática
                    </p>
                    <p className="text-sm text-foreground/80">{conc.implicacao_clinica}</p>
                  </div>
                )}
                <LabeledItem label="Limitações" value={conc.limitacoes} />
                <LabeledItem label="Contexto da evidência" value={conc.contexto_evidencia} />
              </div>
            </AccordionContent>
          </AccordionItem>
        ) : (artigo.conclusao_autores || artigo.implicacao_clinica) ? (
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
        ) : null}
      </Accordion>
    </section>
  );
};

export default AnaliseEstudo;
