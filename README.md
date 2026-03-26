<<<<<<< HEAD
# Graph-Based-Data-Modeling-and-Query-System
Graph-based SAP Order-to-Cash data explorer with natural language querying powered by Groq LLM and Cytoscape.js visualization
=======
# Graph Query System

A context graph system with an LLM-powered natural language query interface for business operations data (sales orders, deliveries, billing, payments).

## Live Demo

> Add your deployed URL here

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     React Frontend                       │
│  Cytoscape.js graph viz │ Chat panel │ Node inspector   │
└────────────────────┬────────────────────────────────────┘
                     │ REST (JSON)
┌────────────────────▼────────────────────────────────────┐
│                  Node.js / Express API                   │
│  /api/graph  /api/chat  /api/node/:type/:id             │
└──────┬──────────────┬───────────────────────────────────┘
       │              │
┌──────▼──────┐  ┌────▼──────────────────────────────────┐
│  SQLite DB  │  │         Gemini 1.5 Flash               │
│  (graph.db) │  │  NL → SQL → execute → NL answer       │
└─────────────┘  └────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology | Reason |
|-------|-----------|--------|
| Backend | Node.js + Express | Lightweight, same language as frontend |
| Database | SQLite (better-sqlite3) | Zero-setup, file-based, perfect for structured query generation |
| Graph (server) | In-memory adjacency built from FK joins | Simple, fast, no separate graph DB needed |
| Graph (UI) | Cytoscape.js | Battle-tested graph viz, good layout algorithms |
| LLM | Gemini 1.5 Flash (free tier) | Fast, generous free tier, excellent SQL generation |
| Frontend | React + Vite | Fast DX, component model works well for split-panel UI |

### Why SQLite over a native graph database?

The LLM's most powerful capability here is generating SQL — it's a language the model knows extremely well from training. SQLite gives us:
- Schema the LLM can reason about directly
- Fast ad-hoc queries without a running server
- Easy deployment (single file)
- The graph structure is *derived* from FK relationships, not stored separately

A graph DB like Neo4j would add complexity without enough benefit at this dataset scale.

---

## Graph Model

### Nodes

| Entity | Color | Description |
|--------|-------|-------------|
| Customer | Purple | The buyer |
| Sales Order | Teal | The purchase agreement |
| Sales Order Item | Light Teal | Line items within an order |
| Delivery | Blue | Physical shipment |
| Billing Document | Amber | Invoice raised |
| Journal Entry | Coral | Financial posting |
| Material | Pink | Product/SKU |
| Payment | Green | Settlement of billing doc |

### Edges (Relationships)

```
Customer ──placed──► Sales Order
Sales Order ──contains──► Sales Order Item
Sales Order Item ──references──► Material
Sales Order ──fulfilled by──► Delivery
Sales Order ──billed via──► Billing Document
Delivery ──triggers──► Billing Document
Billing Document ──posts to──► Journal Entry
Billing Document ──settled by──► Payment
```

### Full Business Flow

```
Customer → Sales Order → Delivery → Billing Document → Journal Entry
                     ↘                              ↘
                      Sales Order Item → Material    Payment
```

---

## LLM Prompting Strategy

### Two-step prompting

1. **Step 1 — Intent resolution**: Send the user message with the full schema. Gemini decides whether to generate SQL or answer directly.
2. **Step 2 — Synthesis**: After SQL execution, send the raw results back to Gemini to produce a plain-English answer with referenced entity IDs.

### System prompt design

The system prompt includes:
- Full SQLite schema with FK relationships
- Strict domain restriction instruction
- JSON response format spec (`{"action":"query","sql":"..."}` or `{"action":"answer","text":"..."}`)
- The `GUARDRAIL` sentinel for off-topic detection
- Instruction to include `referenced_ids` for graph highlighting

### Guardrails (two layers)

**Layer 1 — Pattern matching** (fast, pre-LLM):
- Regex patterns for off-topic requests (general knowledge, coding help, creative writing, jailbreak attempts)
- Dataset keyword whitelist — if the message mentions sales orders, deliveries, etc., it bypasses the pattern check
- Runs in <1ms, saves LLM quota

**Layer 2 — LLM self-rejection**:
- The system prompt instructs Gemini to respond with the exact string `GUARDRAIL` for unrelated queries
- The server detects this sentinel and returns the standard rejection message

### Example prompt/response cycle

```
User: "Which products are associated with the most billing documents?"

→ Gemini Step 1:
  {"action":"query","sql":"SELECT m.name, COUNT(bd.id) as billing_count
   FROM materials m
   JOIN sales_order_items soi ON soi.material_id = m.id
   JOIN billing_documents bd ON bd.sales_order_id = soi.sales_order_id
   GROUP BY m.id, m.name ORDER BY billing_count DESC LIMIT 10"}

→ Backend executes SQL, gets results

→ Gemini Step 2:
  {"action":"answer","text":"The top product is Widget A with 42 billing documents...","referenced_ids":["M001","M002"]}

→ Frontend highlights M001 and M002 nodes in the graph
```

---

## Setup & Running

### Prerequisites

- Node.js 18+
- A [Google AI Studio](https://aistudio.google.com) API key (free)

### 1. Clone and install

```bash
git clone <your-repo-url>
cd graph-query-system

# Install backend dependencies
cd backend && npm install

# Install frontend dependencies
cd ../frontend && npm install
```

### 2. Configure environment

```bash
cd backend
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY
```

### 3. Ingest the dataset

```bash
cd backend

# Create the data directory and copy your CSV/XLSX files into it
mkdir -p data
# Copy your dataset files to backend/data/

# Run ingestion
npm run ingest
```

The ingestion script auto-maps file/sheet names to tables using fuzzy name matching. Supported mappings:

| File/sheet name contains | Maps to table |
|--------------------------|---------------|
| sales_order, order | sales_orders |
| delivery, deliveries | deliveries |
| billing, invoice | billing_documents |
| journal, fi_document | journal_entries |
| customer | customers |
| material, product | materials |
| payment | payments |

### 4. Start the backend

```bash
cd backend
npm run dev
# Runs on http://localhost:3001
```

### 5. Start the frontend

```bash
cd frontend
npm run dev
# Runs on http://localhost:5173
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/graph` | Full graph (nodes + edges, up to 50 per type) |
| GET | `/api/stats` | Entity counts per table |
| GET | `/api/node/:type/:id` | Single node detail |
| GET | `/api/node/:type/:id/expand` | 1-hop neighbours |
| POST | `/api/chat` | `{ message, history[] }` → NL answer + SQL + referenced_ids |

---

## Deployment

### Render (recommended — free tier)

**Backend:**
1. New Web Service → connect repo → set root to `backend/`
2. Build command: `npm install`
3. Start command: `npm start`
4. Add env var: `GEMINI_API_KEY`
5. Add a persistent disk mounted at `/opt/render/project/src/backend/data` for the SQLite file

**Frontend:**
1. New Static Site → connect repo → set root to `frontend/`
2. Build command: `npm run build`
3. Publish directory: `dist`
4. Add env var: `VITE_API_URL=https://your-backend.onrender.com`

> Update `frontend/src/api.js` baseURL to use `import.meta.env.VITE_API_URL` for production.

---

## Example Queries

Try these in the chat interface:

- "Which products are associated with the highest number of billing documents?"
- "Trace the full flow of billing document [ID]"
- "Find sales orders that were delivered but never billed"
- "Find orders that were billed without a delivery"
- "Which customers have placed the most orders?"
- "What is the total payment amount by currency?"
- "Show me all unpaid billing documents"
- "Which plant handles the most deliveries?"

---

# AI Coding Session Logs

This directory contains session transcripts and summaries from Claude.ai sessions used during development of the Graph Query System.

Each file documents:
- The prompts used
- What the AI generated
- What was manually changed and why
- Key architectural decisions made during the session

---

## Session Index

| # | Session | Key Topic | Outcome |
|---|---------|-----------|---------|
| [01](./session-01-schema-design.md) | Schema Design & DB Choice | SQLite vs Neo4j tradeoffs, normalized schema from SAP columns | `schema.sql` with 8 tables + FK indexes |
| [02](./session-02-ingestion-script.md) | Data Ingestion Script | Fuzzy filename matching, FK-ordered insertion, error handling | `ingest.js` with dry-run support |
| [03](./session-03-graph-builder.md) | In-Memory Graph Construction | FK → Cytoscape node/edge derivation, 1-hop expansion API | `graph-builder.js`, `/api/graph`, `/api/node/:id/expand` |
| [04](./session-04-llm-prompting.md) | LLM Prompting Strategy | Two-step NL→SQL→NL pipeline, GUARDRAIL sentinel, result truncation | `prompts.js`, `groq-client.js`, `chat.js` |
| [05](./session-05-frontend-cytoscape.md) | React Frontend + Cytoscape | Split layout, node highlighting, collapsible SQL display | Full React frontend |
| [06](./session-06-guardrails.md) | Guardrails | Regex pre-filter + LLM sentinel, whitelist design, 20-case test suite | `guardrail.js` |

---

## How These Logs Were Generated

Primary tool: **Claude.ai** (claude.ai chat interface)  
Secondary: **Claude Code** for file-level edits and debugging iterations

Sessions were conducted iteratively — each session built on the working output of the previous one. The logs document the actual prompts used, AI outputs, and manual modifications made during development.

---

## Prompt Quality Observations

Things that improved AI output quality during this project:

1. **Providing the full schema in context** — SQL generation quality jumped significantly when the model had all table/column names
2. **Asking for tradeoffs before asking for code** — Session 01 and 04 both started with architecture questions, which led to better-justified decisions
3. **Sending error messages back to the LLM** — The FK constraint bug in Session 02 was fixed in one follow-up by pasting the exact error
4. **Explicit format constraints** — Specifying "return ONLY JSON, no backticks, no markdown" eliminated a whole class of parsing errors
5. **Testing edge cases with the AI** — Session 06's 20-case test prompt caught the whitelist-ordering bug before it shipped

