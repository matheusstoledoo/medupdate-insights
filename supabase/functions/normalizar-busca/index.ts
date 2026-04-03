import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const { texto, filtros } = await req.json();

    if (!texto || typeof texto !== "string" || texto.trim().length < 3) {
      return new Response(
        JSON.stringify({ error: "Texto de busca muito curto" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY não configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let filtroExtra = "";
    if (filtros?.tipoEstudo && filtros.tipoEstudo !== "todos") {
      const tipos: Record<string, string> = {
        rct: "Randomized Controlled Trial",
        meta: "Meta-Analysis",
        revisao: "Systematic Review",
        coorte: "Cohort Study",
      };
      filtroExtra += `\nO usuário quer especificamente estudos do tipo: ${tipos[filtros.tipoEstudo] || filtros.tipoEstudo}. Inclua o filtro de tipo de publicação na query PubMed.`;
    }
    if (filtros?.periodo && filtros.periodo !== "todos") {
      filtroExtra += `\nO usuário quer artigos dos últimos ${filtros.periodo === "2anos" ? "2 anos" : "5 anos"}. NÃO inclua filtros de data na query — isso será tratado separadamente.`;
    }

    const prompt = `Você é um especialista em busca bibliográfica médica no PubMed.
O usuário buscou: "${texto.trim()}"
${filtroExtra}

REGRAS OBRIGATÓRIAS para construir a query:
1. Identifique os conceitos principais separadamente
2. Para cada conceito, liste MeSH term + sinônimos + abreviações
3. Conecte os conceitos com AND (do mais geral para o mais específico)
4. Use OR entre sinônimos do mesmo conceito
5. NUNCA use um único termo sem alternativas
6. Inclua sempre variações em inglês (ex: dapagliflozin, dapaglifozina → "Dapagliflozin")

Retorne APENAS um JSON válido sem markdown, sem backticks:
{
  "query_pubmed": "query otimizada para PubMed com termos MeSH, operadores booleanos AND/OR e qualificadores [MeSH Terms][Title/Abstract]",
  "query_cochrane": "termos simplificados para busca na Cochrane, em inglês, sem qualificadores técnicos",
  "conceitos": [
    {
      "conceito": "nome do conceito em português",
      "termos_usados": ["lista", "de", "termos", "inglês", "usados"]
    }
  ],
  "tipo_busca": "tratamento|diagnóstico|epidemiologia|prognóstico|outro"
}

EXEMPLOS de queries corretas (do geral para específico):

Entrada: "dapaglifozina insuficiência cardíaca"
Saída query_pubmed:
("Heart Failure"[MeSH Terms] OR "heart failure"[Title/Abstract] OR "cardiac failure"[Title/Abstract]) AND ("Dapagliflozin"[MeSH Terms] OR "dapagliflozin"[Title/Abstract] OR "Farxiga"[Title/Abstract] OR "SGLT2 inhibitor"[Title/Abstract] OR "sodium glucose cotransporter 2"[Title/Abstract])

Entrada: "tratamento fibrilação atrial novos anticoagulantes"
Saída query_pubmed:
("Atrial Fibrillation"[MeSH Terms] OR "atrial fibrillation"[Title/Abstract] OR "AF"[Title/Abstract]) AND ("Anticoagulants"[MeSH Terms] OR "anticoagulant"[Title/Abstract] OR "NOAC"[Title/Abstract] OR "DOAC"[Title/Abstract] OR "direct oral anticoagulant"[Title/Abstract])

Entrada: "hipertensão resistente espironolactona"
Saída query_pubmed:
("Hypertension"[MeSH Terms] OR "hypertension"[Title/Abstract] OR "high blood pressure"[Title/Abstract]) AND ("drug-resistant"[Title/Abstract] OR "resistant"[Title/Abstract] OR "refractory"[Title/Abstract]) AND ("Spironolactone"[MeSH Terms] OR "spironolactone"[Title/Abstract] OR "aldosterone antagonist"[Title/Abstract])`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Claude API error:", response.status, errText);
      return new Response(
        JSON.stringify({ error: "Erro ao processar busca com IA" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const claudeData = await response.json();
    const textContent = claudeData.content?.[0]?.text || "";

    let parsed;
    try {
      const jsonMatch = textContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found");
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      console.error("Failed to parse Claude response:", textContent);
      return new Response(
        JSON.stringify({ error: "Resposta da IA não pôde ser processada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("normalizar-busca error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
