const { groqChat } = require('../lib/groq');

async function getAIInventoryRecommendations(analytics) {
  const summary = {
    kpis: analytics.kpis,
    insightBanner: analytics.insightBanner,
    categorySales: analytics.categorySales?.slice(0, 6),
    topSelling: analytics.topSelling?.slice(0, 8),
    stockHealth: analytics.stockHealth?.filter((s) => s.filter !== 'ok').slice(0, 8),
    priceAlerts: analytics.priceAlerts?.slice(0, 6),
    summary: analytics.summary,
  };

  const system = `You are an inventory management AI for an IT services e-commerce store.
Analyze the JSON data and return ONLY valid JSON (no markdown) with this shape:
{
  "executiveSummary": "2-3 sentences for management",
  "recommendations": [
    {
      "product": "product or category name",
      "action": "one of: Increase purchase quantity | Reduce stock holding | Drop this product | Replace with alternative product | Apply promotional discount",
      "reason": "short justification",
      "priority": "critical | warning | info"
    }
  ],
  "categoryInsights": [
    { "category": "name", "verdict": "top-performing | underperforming | stable", "note": "one line" }
  ]
}
Provide 6-10 specific recommendations using sales, stock, pricing trends, and demand patterns.`;

  const content = await groqChat(
    [
      { role: 'system', content: system },
      { role: 'user', content: JSON.stringify(summary) },
    ],
    { jsonMode: true, maxTokens: 2000 }
  );

  try {
    return JSON.parse(content);
  } catch {
    return {
      executiveSummary: analytics.insightBanner || content.slice(0, 400),
      recommendations: [],
      categoryInsights: [],
    };
  }
}

async function getGroqChatReply(userMessage, context = {}) {
  const system = `You are the Be IT:Service store assistant. Be concise and helpful (2-4 short sentences max).
IMPORTANT: Never list product names, prices, or numbered service lists. Answer policy and general questions only.
Store context: ${JSON.stringify(context)}`;

  return groqChat([
    { role: 'system', content: system },
    { role: 'user', content: userMessage },
  ]);
}

module.exports = { getAIInventoryRecommendations, getGroqChatReply };
