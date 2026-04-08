import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import ArtigoHeader from "@/components/artigo/ArtigoHeader";
import AnaliseEstudo from "@/components/artigo/AnaliseEstudo";
import AvaliacaoQualidade from "@/components/artigo/AvaliacaoQualidade";
import ArticleChat from "@/components/ArticleChat";

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

        {/* SEÇÃO 4: QUESTÃO CLÍNICA */}
        <Link
          to={`/quiz/${artigo.id}`}
          className="inline-block rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Responder questão clínica →
        </Link>
      </main>
    </div>
  );
};

export default Artigo;
