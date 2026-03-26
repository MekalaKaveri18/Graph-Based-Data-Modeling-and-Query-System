# Session 04 — LLM Prompting Strategy (NL → SQL → NL)

**Date:** 2026-03-25  
**Tool:** Claude.ai  
**Duration:** ~1.5 hours  
**Goal:** Design the two-step prompting pipeline: intent resolution → SQL generation → answer synthesis

---

## Context

This was the most complex session. The core challenge: take a user's natural language question, generate valid SQLite SQL, execute it, and turn the results into a readable answer — all while keeping the LLM grounded in the actual data and not hallucinating.

---

## Prompt 1 — Architecture Design

> I want to build a chat interface where users ask questions about a business dataset (sales orders, deliveries, billing documents, payments, etc.). The backend should use an LLM (Groq llama-3.3-70b) to translate the question into SQL, execute it against SQLite, and return a plain-English answer.
>
> What are the failure modes of a single-prompt approach (user question → SQL → answer in one shot) vs a two-step approach (step 1: generate SQL, step 2: synthesize answer from results)?

### AI Response (key points)

The AI clearly recommended two steps:

> "Single-shot prompting asks the model to simultaneously understand intent, generate syntactically correct SQL, predict what the results will look like, and write a natural answer — all before seeing any data. The failure rate compounds at each step.
>
> Two-step is more reliable: Step 1 focuses entirely on SQL generation with the schema in context. Step 2 receives the actual query results and focuses entirely on synthesis. Each step has a single job."

This convinced me to go two-step.

---

## Prompt 2 — System Prompt Design

> Design a system prompt for Step 1. It should:
> - Include the full SQLite schema
> - Instruct the model to return JSON: either {"action":"query","sql":"..."} or {"action":"answer","text":"..."}
> - Restrict the model to only answer questions about the dataset
> - Include a GUARDRAIL sentinel for off-topic detection
> - Tell the model to include referenced entity IDs for graph highlighting

### AI Response — System Prompt Draft

```
You are a data query assistant for a business operations dataset.

You have access to a SQLite database with the following schema:
[SCHEMA INJECTED HERE]

RULES:
1. Only answer questions about this dataset. 
2. For data questions, generate a SQL query. Return ONLY valid JSON:
   {"action": "query", "sql": "SELECT ..."}
3. For questions you can answer without SQL (e.g. what tables exist), return:
   {"action": "answer", "text": "...", "referenced_ids": []}
4. For questions unrelated to this dataset (general knowledge, coding help, creative writing, personal questions), return EXACTLY the string: GUARDRAIL
5. Do not explain your reasoning. Return only the JSON or GUARDRAIL.
6. In Step 2 synthesis, include a "referenced_ids" array of entity IDs mentioned in your answer so the UI can highlight them.

SCHEMA:
[full schema here]
```

### What I Changed

- Added explicit examples to the system prompt after seeing the model occasionally return SQL with backticks or markdown fencing. Added: `Do not wrap SQL in backticks or markdown code blocks.`
- Added a note about SQLite-specific syntax: `Use SQLite syntax. Do not use ILIKE, use LIKE instead. Do not use CURRENT_TIMESTAMP as a value in WHERE clauses.`
- The AI's initial draft had `referenced_ids` only in Step 2. I moved it to Step 1 as well so the model could flag IDs even for direct answers.

---

## Prompt 3 — Step 2 Synthesis Prompt

> Now design the Step 2 prompt. After SQL execution, I send the results back to the LLM. It should produce a readable answer citing specific IDs and values from the results.

### AI Response

```
You are synthesizing a data query result into a plain-English answer.

User question: {original_question}
SQL executed: {sql}
Results (JSON): {results}

Instructions:
- Write a clear, concise answer based ONLY on the results above.
- Reference specific IDs, names, or values from the results.
- If results are empty, say so clearly.
- Include a "referenced_ids" array of entity IDs you mentioned.
- Return JSON: {"text": "...", "referenced_ids": ["ID1", "ID2"]}
```

### Iteration

**Problem:** For large result sets (e.g. 50 rows), the model would summarize poorly or just list all IDs.

**My follow-up prompt:**
> If the results have more than 20 rows, the model lists all IDs which is not useful. How should I handle this?

**AI suggestion:** 
> "Truncate results to top 10 rows before sending to Step 2, and add a note in the prompt: 'Results have been truncated to the top 10 rows for brevity. Summarize trends, don't list every row.'"

Added `MAX_RESULTS_FOR_SYNTHESIS = 10` in the backend config.

---

## Prompt 4 — Error Handling

> What happens if the LLM generates invalid SQL? The SQLite execution will throw. How should I handle this gracefully?

### AI Response

Suggested a retry loop with error feedback:

```javascript
async function executeWithRetry(question, db, maxRetries = 2) {
  let lastError = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const sql = await generateSQL(question, lastError);
    try {
      const results = db.prepare(sql).all();
      return { sql, results };
    } catch (err) {
      lastError = err.message;
      // On retry, send error back to LLM:
      // "The SQL you generated caused this error: {err}. Please fix it."
    }
  }
  
  return { error: 'Could not generate a valid query after retries.' };
}
```

I implemented a single retry (not two) to avoid burning API quota.

---

## Final Pipeline

```
User message
    ↓
Layer 1: Regex guardrail (pre-LLM, <1ms)
    ↓ (if passes)
Groq Step 1: intent → {"action":"query","sql":"..."} or GUARDRAIL
    ↓ (if query)
SQLite execution (with 1 retry on error)
    ↓
Groq Step 2: results → {"text":"...","referenced_ids":[...]}
    ↓
Response to frontend + highlight referenced nodes
```

---

## Key Decisions

- **Two-step over single-shot** — more reliable, each step has one job
- **GUARDRAIL sentinel** — simple string check, no JSON parsing needed for rejection
- **Result truncation at 10** — prevents overwhelming Step 2 with too much data
- **Single retry on SQL error** — balances reliability vs API quota

---

## Files Created / Modified

- `backend/src/llm/prompts.js`
- `backend/src/llm/groq-client.js`
- `backend/src/routes/chat.js`
