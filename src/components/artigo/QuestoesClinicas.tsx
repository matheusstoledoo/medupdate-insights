import { useState } from "react";
import { CheckCircle, XCircle } from "lucide-react";
import type { ArtigoData } from "./types";

interface Questao {
  enunciado: string;
  alt_a: string;
  alt_b: string;
  alt_c: string;
  alt_d: string;
  resposta_correta: string;
  feedback: string;
}

interface Props { artigo: ArtigoData; }

const QuestionCard = ({ questao, index }: { questao: Questao; index: number }) => {
  const [selected, setSelected] = useState<string | null>(null);
  const alternatives = [
    { key: "a", text: questao.alt_a },
    { key: "b", text: questao.alt_b },
    { key: "c", text: questao.alt_c },
    { key: "d", text: questao.alt_d },
  ].filter(a => a.text);

  const correct = questao.resposta_correta?.toLowerCase()?.replace("alt_", "") || "";
  const answered = selected !== null;

  return (
    <div className="rounded-lg border border-border bg-surface-secondary p-4">
      <p className="text-[0.85rem] font-medium text-foreground mb-3">
        <span className="text-primary font-semibold mr-1">Q{index + 1}.</span>
        {questao.enunciado}
      </p>
      <div className="space-y-2">
        {alternatives.map(({ key, text }) => {
          const isCorrect = key === correct;
          const isSelected = key === selected;
          let cls = "border-border bg-background hover:bg-muted/50 cursor-pointer";
          if (answered) {
            if (isCorrect) cls = "border-grade-a-text/40 bg-grade-a-bg";
            else if (isSelected && !isCorrect) cls = "border-grade-d-text/40 bg-grade-d-bg";
            else cls = "border-border bg-background opacity-60";
          }
          return (
            <button
              key={key}
              onClick={() => !answered && setSelected(key)}
              disabled={answered}
              className={`w-full text-left flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-[0.84rem] transition-colors ${cls}`}
            >
              <span className="font-semibold text-muted-foreground uppercase shrink-0">{key})</span>
              <span className="text-foreground">{text}</span>
              {answered && isCorrect && <CheckCircle className="h-4 w-4 text-grade-a-text ml-auto shrink-0" />}
              {answered && isSelected && !isCorrect && <XCircle className="h-4 w-4 text-grade-d-text ml-auto shrink-0" />}
            </button>
          );
        })}
      </div>
      {answered && questao.feedback && (
        <div className="mt-3 rounded-md bg-muted/50 border border-border px-3 py-2.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Explicação</p>
          <p className="text-[0.84rem] text-foreground/80 leading-relaxed">{questao.feedback}</p>
        </div>
      )}
    </div>
  );
};

const QuestoesClinicas = ({ artigo }: Props) => {
  const ac = artigo.analise_completa as Record<string, any> | null;

  // Build questions array from structured data
  const questoes: Questao[] = [];

  if (ac) {
    for (const key of ["questao_1", "questao_2", "questao_3"]) {
      const q = ac[key];
      if (q?.enunciado) {
        questoes.push({
          enunciado: q.enunciado,
          alt_a: q.alt_a || "",
          alt_b: q.alt_b || "",
          alt_c: q.alt_c || "",
          alt_d: q.alt_d || "",
          resposta_correta: q.resposta_correta || "",
          feedback: q.feedback || "",
        });
      }
    }
  }

  // Fallback to flat fields
  if (questoes.length === 0 && artigo.questao) {
    questoes.push({
      enunciado: artigo.questao,
      alt_a: artigo.alt_a || "",
      alt_b: artigo.alt_b || "",
      alt_c: artigo.alt_c || "",
      alt_d: artigo.alt_d || "",
      resposta_correta: artigo.resposta_correta || "",
      feedback: artigo.feedback_quiz || "",
    });
  }

  if (questoes.length === 0) return null;

  return (
    <section className="mb-6">
      <h2 className="text-[0.68rem] font-medium uppercase tracking-[0.1em] text-muted-foreground mb-3">
        Questões clínicas
      </h2>
      <div className="space-y-4">
        {questoes.map((q, i) => (
          <QuestionCard key={i} questao={q} index={i} />
        ))}
      </div>
    </section>
  );
};

export default QuestoesClinicas;
