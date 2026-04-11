import { Link, useNavigate } from "react-router-dom";
import { ChevronLeft, AlertCircle, FileText } from "lucide-react";
import { abrirLinkExterno, getLinkArtigo, getLabelLinkArtigo } from "@/utils/artigoUtils";
import GradeBadge from "@/components/GradeBadge";
import type { ArtigoData } from "./types";

interface Props { artigo: ArtigoData; }

const ArtigoHeader = ({ artigo }: Props) => {
  const navigate = useNavigate();
  const temTextoCompleto = artigo.tem_texto_completo === true;
  const fonteTexto = artigo.fonte_texto as string | null;

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

      {/* Badge permanente de fonte */}
      <div className="flex items-center gap-2 mb-4">
        {temTextoCompleto ? (
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium bg-grade-a-bg text-grade-a-text border border-grade-a-text/20">
            <FileText className="h-3.5 w-3.5" />
            Análise do texto completo · {fonteTexto}
          </span>
        ) : null}
      </div>

      {!temTextoCompleto && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 mb-4">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800 mb-1">
              Análise baseada no abstract
            </p>
            <p className="text-xs text-amber-700 leading-relaxed">
              O texto completo deste artigo não está disponível
              gratuitamente via PubMed Central. Para uma análise
              completa, faça upload do PDF na aba{' '}
              <span className="font-medium">Upload</span>.
            </p>
            <button
              onClick={() => navigate('/?tab=upload')}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-900 underline underline-offset-2 transition-colors"
            >
              Fazer upload do PDF para análise completa →
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 font-mono text-[0.75rem] text-muted-foreground mb-8">
        <span className="uppercase tracking-wider">{artigo.journal}</span>
        <span>·</span>
        <span>{artigo.ano}</span>
        {(() => {
          const ano = artigo.ano;
          const dataEntrada = artigo.data_entrada_feed;
          if (ano && ano < 2026 && dataEntrada) {
            const entrada = new Date(dataEntrada);
            const diffDias = Math.floor((new Date().getTime() - entrada.getTime()) / 86400000);
            if (diffDias <= 30) {
              return (
                <>
                  <span>·</span>
                  <span className="text-[10px] text-muted-foreground bg-[hsl(var(--bg-tertiary))] rounded px-1.5 py-0.5">
                    Indexado recentemente
                  </span>
                </>
              );
            }
          }
          return null;
        })()}
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
    </>
  );
};

export default ArtigoHeader;
