import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import ArtigoHeader from "@/components/artigo/ArtigoHeader";
import AnaliseEstudo from "@/components/artigo/AnaliseEstudo";
import AvaliacaoQualidade from "@/components/artigo/AvaliacaoQualidade";
import QuestoesClinicas from "@/components/artigo/QuestoesClinicas";
import ArticleChat from "@/components/ArticleChat";
import AddToReviewButton from "@/components/artigo/AddToReviewButton";

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

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container max-w-[720px] py-8">
        <ArtigoHeader artigo={artigo} />

        {/* SEÇÃO 1: RESUMO */}
        <section className="mb-6">
          <h2 className="text-[0.68rem] font-medium uppercase tracking-[0.1em] text-muted-foreground mb-3">
            Resumo
          </h2>
          <p className="text-[0.97rem] leading-[1.78] text-foreground">
            {artigo.resumo_pt}
          </p>
        </section>

        {/* SEÇÃO 2: ANÁLISE DO ESTUDO */}
        <AnaliseEstudo artigo={artigo} />

        {/* SEÇÃO 3: AVALIAÇÃO DA QUALIDADE */}
        <AvaliacaoQualidade artigo={artigo} />

        {/* SEÇÃO 4: QUESTÕES CLÍNICAS */}
        <QuestoesClinicas artigo={artigo} />

        <AddToReviewButton artigoId={artigo.id} />

        <ArticleChat
          articleContent={[
            artigo.resumo_pt,
            artigo.introducao_resumo,
            artigo.metodologia_detalhada,
            artigo.resultados_principais,
            artigo.conclusao_autores,
            artigo.implicacao_clinica,
            artigo.analise_metodologica,
            artigo.contexto_vs_anterior,
          ].filter(Boolean).join("\n\n")}
        />
      </main>
    </div>
  );
};

export default Artigo;
