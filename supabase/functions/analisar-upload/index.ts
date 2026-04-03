import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { texto, fonte } = await req.json();

    if (!texto || typeof texto !== "string" || texto.trim().length < 100) {
      return new Response(JSON.stringify({ error: "Texto muito curto para análise (mínimo 100 caracteres)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY não configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const textoLimitado = texto.trim().substring(0, 15000);

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2500,
        messages: [{
          role: "user",
          content: `Você é especialista em epidemiologia clínica analisando artigos médicos para especialistas brasileiros.

Analise o artigo abaixo e retorne SOMENTE um JSON válido, sem texto antes ou depois, sem markdown:
{
  "titulo": "título do artigo em português",
  "journal": "nome do periódico se identificável, senão null",
  "ano": ano de publicação se identificável,
  "tipo_estudo": "tipo exato do estudo",
  "resumo_pt": "3-4 frases em português para especialistas",
  "grade": "Alto, Moderado, Baixo ou Muito baixo",
  "grade_justificativa": "justificativa específica",
  "rob_resultado": "Baixo risco, Algumas preocupações ou Alto risco",
  "analise_metodologica": "análise detalhada em 4-5 frases",
  "vieses_detalhados": "avaliação por domínio RoB 2 com julgamento",
  "limitacoes_autores": "limitações declaradas pelos autores",
  "conflitos_interesse": "conflitos e financiamento reportados",
  "contexto_vs_anterior": "como se relaciona com evidência anterior",
  "questao": "caso clínico de 2-3 frases para quiz",
  "alt_a": "alternativa A",
  "alt_b": "alternativa B",
  "alt_c": "alternativa C",
  "alt_d": "alternativa D",
  "resposta_correta": "A, B, C ou D",
  "feedback_quiz": "2-3 frases explicando a resposta com impacto clínico"
}

Texto do artigo:
${textoLimitado}`,
        }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      console.error("Claude API error:", claudeRes.status, errText);
      return new Response(JSON.stringify({ error: "Erro ao analisar artigo com IA" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const claudeData = await claudeRes.json();
    const rawContent = claudeData?.content?.[0]?.text ?? "";

    let parsed: Record<string, any>;
    try {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found");
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return new Response(JSON.stringify({ error: "Resposta da IA inválida" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const ano = parsed.ano ?? new Date().getFullYear();

    const { data: inserted, error: insertErr } = await supabase.from("artigos").insert({
      titulo: parsed.titulo || "Artigo enviado por upload",
      journal: parsed.journal || null,
      ano,
      especialidade: "Cardiologia",
      resumo_pt: parsed.resumo_pt || null,
      tipo_estudo: parsed.tipo_estudo || null,
      grade: parsed.grade || null,
      grade_justificativa: parsed.grade_justificativa || null,
      rob_resultado: parsed.rob_resultado || null,
      analise_metodologica: parsed.analise_metodologica || null,
      contexto_vs_anterior: parsed.contexto_vs_anterior || null,
      vieses_detalhados: parsed.vieses_detalhados || null,
      limitacoes_autores: parsed.limitacoes_autores || null,
      conflitos_interesse: parsed.conflitos_interesse || null,
      questao: parsed.questao || null,
      alt_a: parsed.alt_a || null,
      alt_b: parsed.alt_b || null,
      alt_c: parsed.alt_c || null,
      alt_d: parsed.alt_d || null,
      resposta_correta: parsed.resposta_correta || null,
      feedback_quiz: parsed.feedback_quiz || null,
      tem_texto_completo: true,
      fonte_texto: "upload",
      citacoes: 0,
      score_relevancia: 50,
      data_publicacao: new Date().toISOString().split("T")[0],
    }).select("*").single();

    if (insertErr) {
      console.error("DB insert error:", insertErr);
      return new Response(JSON.stringify({ error: `Erro ao salvar: ${insertErr.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ artigo: inserted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("analisar-upload error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
