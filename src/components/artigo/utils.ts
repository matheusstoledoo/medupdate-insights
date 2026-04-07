import type { DomainStatus, RobDomain } from "./types";

const DOMINIOS_ROB2 = [
  { id: "D1", label: "Processo de randomização" },
  { id: "D2", label: "Desvios da intervenção" },
  { id: "D3", label: "Dados faltantes" },
  { id: "D4", label: "Mensuração dos desfechos" },
  { id: "D5", label: "Seleção dos resultados reportados" },
];

export function parseViesesDetalhados(texto: string): RobDomain[] {
  const lines = texto.split(/\n|;/).map(l => l.trim()).filter(Boolean);
  return DOMINIOS_ROB2.map((dominio) => {
    const regex = new RegExp(dominio.id + "|" + dominio.label.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "i");
    const matchLine = lines.find(l => regex.test(l));
    let status: DomainStatus = "nao_avaliado";
    let detail = "Não avaliado — informação insuficiente";
    if (matchLine) {
      const lower = matchLine.toLowerCase();
      if (lower.includes("alto risco") || lower.includes("alto")) status = "alto";
      else if (lower.includes("algumas preocupações") || lower.includes("preocupações") || lower.includes("preocupacoes")) status = "preocupações";
      else if (lower.includes("baixo risco") || lower.includes("baixo")) status = "baixo";
      detail = matchLine.replace(/^[^:]+:\s*/, "").trim() || matchLine;
    }
    return { ...dominio, status, detail };
  });
}

export function detectConflito(texto: string): "ausente" | "presente" {
  const lower = texto.toLowerCase();
  if (
    lower.includes("nenhum conflito") || lower.includes("sem conflito") ||
    lower.includes("ausência de conflito") || lower.includes("não declararam conflito") ||
    lower.includes("não reportaram conflito") || lower.includes("nothing to disclose") ||
    lower.includes("no conflicts")
  ) return "ausente";
  return "presente";
}

export function isRCT(tipo: string | null): boolean {
  if (!tipo) return false;
  const l = tipo.toLowerCase();
  return l.includes("randomizado") || l.includes("rct") || l.includes("ensaio");
}

export function isRevisao(tipo: string | null): boolean {
  if (!tipo) return false;
  const l = tipo.toLowerCase();
  return l.includes("revisão") || l.includes("meta-análise") || l.includes("meta-analise") || l.includes("systematic") || l.includes("metanálise");
}
