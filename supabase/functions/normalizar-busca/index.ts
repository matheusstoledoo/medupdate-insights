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

    const prompt = `Você é um especialista em busca bibliográfica médica.
O usuário quer buscar: "${texto.trim()}"
${filtroExtra}

Retorne APENAS um JSON válido sem markdown, sem backticks:
{
  "query_pubmed": "query otimizada para PubMed com termos MeSH quando aplicável, em inglês, usando operadores booleanos AND/OR/NOT e qualificadores [MeSH Terms][Title/Abstract] etc",
  "query_cochrane": "termos simplificados para busca na Cochrane, em inglês, sem qualificadores técnicos",
  "termos_identificados": ["lista", "dos", "conceitos", "principais"],
  "tipo_busca": "tratamento|diagnóstico|epidemiologia|prognóstico|outro"
}

Exemplos:
- "tratamento da insuficiência cardíaca" →
  query_pubmed: "(\"Heart Failure\"[MeSH Terms] OR \"heart failure\"[Title/Abstract]) AND (\"therapy\"[MeSH Subheading] OR \"treatment\"[Title/Abstract] OR \"management\"[Title/Abstract])"

- "novos anticoagulantes no AVC" →
  query_pubmed: "(\"Anticoagulants\"[MeSH Terms] OR \"NOAC\"[Title/Abstract] OR \"DOAC\"[Title/Abstract]) AND (\"Stroke\"[MeSH Terms] OR \"stroke\"[Title/Abstract])"

- "metformina diabetes tipo 2 idosos" →
  query_pubmed: "\"Metformin\"[MeSH Terms] AND \"Diabetes Mellitus, Type 2\"[MeSH Terms] AND (\"Aged\"[MeSH Terms] OR \"elderly\"[Title/Abstract])"`;

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

    // Extract JSON from response
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
