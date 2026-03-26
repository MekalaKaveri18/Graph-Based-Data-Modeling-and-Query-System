import Groq from 'groq-sdk';
import { getSchemaDescription, runQuery } from './dataIngestion.js';
import { isOffTopic } from './guardrails.js';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `You are a SQL analyst for a SAP Order-to-Cash dataset.
ONLY answer questions about this dataset. For anything unrelated respond exactly: GUARDRAIL

${getSchemaDescription()}

CRITICAL RULES:
1. Use ONLY the exact table/column names listed above.
2. For "products with most billing documents": JOIN products p ON billing_document_items bdi WHERE bdi.material = p.product
3. For "full flow trace": use the exact verified JOIN path shown in the schema above.
4. For "incomplete flows": use overallDeliveryStatus and overallOrdReltdBillgStatus columns.
5. Never JOIN on columns that don't match — always follow the VERIFIED JOIN PATHS above.
6. SQLite only. SELECT only. Max 50 rows.

RESPONSE FORMAT — always valid JSON, one of:
{"action":"query","sql":"SELECT ..."}
{"action":"answer","text":"plain English answer","referenced_ids":["id1","id2"]}
GUARDRAIL

Never show SQL to the user in your final answer text.`;

export async function queryWithGemini(userMessage, history = []) {
  if (isOffTopic(userMessage)) {
    return { answer: 'This system only answers questions about the SAP Order-to-Cash dataset.', sql: null, results: null, referenced_ids: [], guardrailed: true };
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.map(h => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content })),
    { role: 'user', content: userMessage }
  ];

  let sqlUsed = null, queryResults = null, referencedIds = [], finalAnswer = null;

  const step1 = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages,
    temperature: 0.1,
    max_tokens: 1024,
  });

  const step1Text = step1.choices[0].message.content.trim();

  if (step1Text.startsWith('GUARDRAIL')) {
    return { answer: 'This system only answers questions about the SAP Order-to-Cash dataset.', sql: null, results: null, referenced_ids: [], guardrailed: true };
  }

  const jsonMatch = step1Text.match(/\{[\s\S]*?\}/s);
  if (!jsonMatch) {
    finalAnswer = step1Text;
  } else {
    let action;
    try { action = JSON.parse(jsonMatch[0]); } catch { finalAnswer = step1Text; }

    if (action?.action === 'query' && action.sql) {
      sqlUsed = action.sql;
      try {
        queryResults = await runQuery(action.sql);
      } catch (err) {
        // Ask model to fix SQL with the error + schema reminder
        const fixMessages = [
          ...messages,
          { role: 'assistant', content: step1Text },
          { role: 'user', content: `SQL error: "${err.message}"\n\nRemember to use exact column names from the schema. Only use tables: sales_order_headers, sales_order_items, outbound_delivery_headers, outbound_delivery_items, billing_document_headers, billing_document_items, journal_entry_items, payments, business_partners, products, plants.\n\nProvide corrected JSON: {"action":"query","sql":"..."}` }
        ];
        const fix = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: fixMessages,
          temperature: 0.1, max_tokens: 512,
        });
        const fixText = fix.choices[0].message.content.trim();
        const fixMatch = fixText.match(/\{[\s\S]*?\}/s);
        if (fixMatch) {
          try {
            const fixed = JSON.parse(fixMatch[0]);
            if (fixed.sql) { sqlUsed = fixed.sql; queryResults = await runQuery(fixed.sql); }
          } catch {
            return { answer: 'Could not execute the required query. Please try rephrasing your question.', sql: sqlUsed, results: null, referenced_ids: [] };
          }
        }
      }

      // Synthesise natural language answer from results
      const resultStr = queryResults
        ? `${queryResults.length} rows returned: ${JSON.stringify(queryResults.slice(0, 25))}`
        : 'Query returned no results.';

      const step2 = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          ...messages,
          { role: 'assistant', content: step1Text },
          { role: 'user', content: `Query results: ${resultStr}\n\nWrite a clear, concise plain English answer. Include specific IDs/names from the data. Respond as JSON:\n{"action":"answer","text":"your answer here","referenced_ids":["id1","id2"]}` }
        ],
        temperature: 0.2,
        max_tokens: 1024,
      });

      const step2Text = step2.choices[0].message.content.trim();
      const ansMatch = step2Text.match(/\{[\s\S]*?\}/s);
      if (ansMatch) {
        try {
          const ans = JSON.parse(ansMatch[0]);
          finalAnswer = ans.text || step2Text;
          referencedIds = ans.referenced_ids || [];
        } catch { finalAnswer = step2Text; }
      } else { finalAnswer = step2Text; }

    } else if (action?.action === 'answer') {
      finalAnswer = action.text || step1Text;
      referencedIds = action.referenced_ids || [];
    } else {
      finalAnswer = step1Text;
    }
  }

  return {
    answer: finalAnswer,
    sql: sqlUsed,
    results: queryResults?.slice(0, 50) ?? null,
    referenced_ids: referencedIds,
    guardrailed: false
  };
}
