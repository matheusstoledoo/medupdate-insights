import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ExternalLink, ChevronLeft, CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import Header from "@/components/Header";
import GradeBadge from "@/components/GradeBadge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const RobIcon = ({ resultado }: { resultado: string }) => {
  const lower = resultado?.toLowerCase() || "";
  if (lower.includes("baixo")) return <CheckCircle className="h-4 w-4 text-primary" />;
  if (lower.includes("preocupações") || lower.includes("algumas")) return <AlertTriangle className="h-4 w-4 text-grade-b-text" />;
  return <XCircle className="h-4 w-4 text-destructive" />;
};

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
              <a
                href={artigo.link_original}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-secondary hover:underline"
              >
                Artigo original <ExternalLink className="h-3 w-3" />
              </a>
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
              <p className="text-sm text-foreground/80 leading-relaxed mb-4">
                {artigo.analise_metodologica}
              </p>
              {artigo.rob_resultado && (
                <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2">
                  <RobIcon resultado={artigo.rob_resultado} />
                  <span className="text-sm font-medium text-foreground">
                    Risco de viés: {artigo.rob_resultado}
                  </span>
                </div>
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
