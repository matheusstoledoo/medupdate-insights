import { Link } from "react-router-dom";
import { ChevronLeft, AlertCircle } from "lucide-react";
import { abrirLinkExterno, getLinkArtigo, getLabelLinkArtigo } from "@/utils/artigoUtils";
import GradeBadge from "@/components/GradeBadge";
import type { ArtigoData } from "./types";

interface Props { artigo: ArtigoData; }

const ArtigoHeader = ({ artigo }: Props) => {
  const temTextoCompleto = artigo.tem_texto_completo === true;

  return (
    <>
      <Link to="/feed" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ChevronLeft className="h-4 w-4" /> Feed
      </Link>

      <div className="mb-4">
        <GradeBadge grade={artigo.grade || ""} size="lg" />
      </div>

      <h1 className="font-serif text-[1.55rem] font-bold text-foreground leading-tight mb-4" style={{ letterSpacing: '-0.025em' }}>
        {artigo.titulo}
      </h1>

      <div className="flex flex-wrap items-center gap-2 font-mono text-[0.75rem] text-muted-foreground mb-8">
        <span className="uppercase tracking-wider">{artigo.journal}</span>
        <span>·</span>
        <span>{artigo.ano}</span>
        <span>·</span>
        <span>{artigo.citacoes} citações</span>
        {getLinkArtigo(artigo) && (
          <>
            <span>·</span>
            <button onClick={() => abrirLinkExterno(getLinkArtigo(artigo))} className="inline-flex items-center gap-1 text-primary hover:underline">
              {getLabelLinkArtigo(artigo)}
            </button>
          </>
        )}
      </div>

      <div className="h-px bg-[hsl(var(--divider))] mb-6" />

      {!temTextoCompleto && (
        <div className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium bg-grade-b-bg text-grade-b-text mb-6">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Texto completo não disponível — análise baseada no abstract
        </div>
      )}
    </>
  );
};

export default ArtigoHeader;
