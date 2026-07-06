const { getPool } = require('../db/pool');
const { loadEnv } = require('../config/env');

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 12000;

function isWithin24h(generatedAt) {
  const ts = generatedAt instanceof Date ? generatedAt.getTime() : new Date(generatedAt).getTime();
  return Date.now() - ts < CACHE_TTL_MS;
}

function buildPromptPayload(report) {
  return {
    mes: report.mes,
    mesLabel: report.mesLabel,
    kpis: {
      receitas: report.kpis.receitas.total,
      despesas: report.kpis.despesas.total,
      saldo: report.kpis.saldo.total,
      saldoDevedor: report.kpis.saldoDevedor.total,
      pctPago: report.pagamentos.pctPago,
    },
    categorias: report.categorias.slice(0, 8).map((c) => ({
      nome: c.categoria,
      valor: c.valor,
      orcamento: c.orcamento,
      overBudget: c.overBudget,
    })),
    forecast: report.forecast.map((f) => ({
      mes: f.mesLabel,
      receitas: f.receitas,
      despesas: f.despesas,
      saldo: f.saldo,
    })),
    atrasados: report.atrasados.slice(0, 10).map((a) => ({
      nome: a.nome,
      valor: a.valor,
      mes: a.mesLabel,
    })),
    alertas: (report.alerts || []).map((a) => a.text),
  };
}

function buildPrompt(report) {
  const data = JSON.stringify(buildPromptPayload(report), null, 2);
  return `Você é um assistente financeiro pessoal. Analise os dados JSON abaixo do mês ${report.mesLabel} e responda APENAS com um JSON válido (sem markdown, sem texto extra) no formato:
{
  "resumoExecutivo": "2 frases objetivas sobre o mês",
  "pontosAtencao": ["bullet 1", "bullet 2", "bullet 3"],
  "planoAcao": ["ação 1", "ação 2", "ação 3"]
}

Regras:
- Escreva em português do Brasil.
- Use SOMENTE informações presentes no JSON — não invente valores, percentuais ou categorias novas.
- pontosAtencao: 3 a 5 itens objetivos sobre riscos e pendências.
- planoAcao: 3 a 5 ações práticas e acionáveis.
- Não repita os mesmos textos em pontosAtencao e planoAcao.

Dados:
${data}`;
}

function parseInsights(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.resumoExecutivo || !Array.isArray(parsed.pontosAtencao) || !Array.isArray(parsed.planoAcao)) {
      return null;
    }
    return {
      resumoExecutivo: String(parsed.resumoExecutivo).trim(),
      pontosAtencao: parsed.pontosAtencao.map((s) => String(s).trim()).filter(Boolean).slice(0, 5),
      planoAcao: parsed.planoAcao.map((s) => String(s).trim()).filter(Boolean).slice(0, 5),
      source: 'gemini',
    };
  } catch {
    return null;
  }
}

async function callGemini(report) {
  const { gemini } = loadEnv();
  if (!gemini.enabled) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(gemini.model)}:generateContent`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': gemini.apiKey,
      },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(report) }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 1024,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.warn('[geminiReport] API error:', res.status, errBody.slice(0, 200));
      return null;
    }

    const body = await res.json();
    const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
    return parseInsights(text);
  } catch (err) {
    console.warn('[geminiReport] call failed:', err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function loadCache(userId, mes) {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT insights, generated_at FROM report_ai_cache WHERE user_id = $1 AND mes = $2',
    [userId, mes],
  );
  if (!rows[0]) return null;
  return {
    insights: rows[0].insights,
    generated_at: rows[0].generated_at,
  };
}

async function upsertCache(userId, mes, insights) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO report_ai_cache (user_id, mes, insights, generated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id, mes)
     DO UPDATE SET insights = EXCLUDED.insights, generated_at = NOW()`,
    [userId, mes, JSON.stringify(insights)],
  );
}

async function getOrCreateAiInsights(userId, mes, report) {
  const cached = await loadCache(userId, mes);
  if (cached && isWithin24h(cached.generated_at)) {
    return {
      ...cached.insights,
      generatedAt: cached.generated_at,
      fromCache: true,
    };
  }

  const insights = await callGemini(report);
  if (!insights) return null;

  const withMeta = {
    ...insights,
    generatedAt: new Date().toISOString(),
    fromCache: false,
  };
  await upsertCache(userId, mes, withMeta);
  return withMeta;
}

module.exports = {
  getOrCreateAiInsights,
  isWithin24h,
};
