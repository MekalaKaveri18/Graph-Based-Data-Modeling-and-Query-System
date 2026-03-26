# Session 01 — Schema Design & Database Choice

**Date:** 2025-03-24 
**Tool:** Claude.ai  
**Duration:** ~45 mins  
**Goal:** Decide on storage layer and design a normalized SQLite schema from the raw dataset

---

## Context

After downloading and opening the dataset, I had 12+ sheets/files covering sales orders, deliveries, billing documents, journal entries, payments, customers, and materials. I needed to decide: graph DB, relational DB, or something else?

---

## Prompt 1

> I have a dataset from an SAP Order-to-Cash process. It has entities like sales orders, deliveries, billing documents, journal entries, payments, customers, and materials. Each entity has IDs that reference others (e.g. a delivery references a sales order ID). I want to build a system where users can query this in natural language. The LLM should generate structured queries dynamically. Should I use Neo4j, SQLite, or something else? Give me tradeoffs.

### AI Response (summarized)

The AI laid out three options:

| Option | Pro | Con |
|--------|-----|-----|
| Neo4j | Native graph traversal, Cypher is expressive | Requires a running server, LLMs generate weaker Cypher than SQL |
| SQLite | LLMs know SQL deeply, zero setup, single file | No native graph ops, JOINs needed for traversal |
| In-memory graph + SQLite | Best of both — SQL for queries, graph for viz | Two layers to maintain |

**Key insight the AI gave me:**
> "LLMs have seen vastly more SQL in training than Cypher or Gremlin. If your primary use case is natural language → structured query, SQLite will give you more reliable query generation with fewer hallucinations."

### My Decision
Went with **SQLite + in-memory graph derived from FK relationships**. The graph is for visualization; SQL is for querying. This separation made sense.

---

## Prompt 2

> Here is a sample of my dataset columns for each entity. Design a normalized SQLite schema with proper foreign keys. I'll paste the column headers now.
> 
> sales_orders: VBELN, KUNNR, ERDAT, NETWR, WAERK, VKORG, VTWEG, SPART  
> deliveries: VBELN, TKNUM, KUNNR, LFART, WADAT_IST, LGORT, WERKS  
> billing_documents: VBELN, FKART, FKDAT, NETWR, WAERK, KUNRG  
> journal_entries: BELNR, BUKRS, GJAHR, BLDAT, WAERS, DMBTR  
> payments: BELNR, BUKRS, AUGDT, DMBTR, WAERS  
> customers: KUNNR, NAME1, ORT01, LAND1, REGIO  
> materials: MATNR, MAKTX, MEINS, MTART, MATKL

### AI Response

Generated a full schema. Key parts:

```sql
CREATE TABLE customers (
  id TEXT PRIMARY KEY,        -- KUNNR
  name TEXT,
  city TEXT,
  country TEXT,
  region TEXT
);

CREATE TABLE sales_orders (
  id TEXT PRIMARY KEY,        -- VBELN
  customer_id TEXT REFERENCES customers(id),
  created_date TEXT,
  net_value REAL,
  currency TEXT,
  sales_org TEXT,
  distribution_channel TEXT,
  division TEXT
);

CREATE TABLE deliveries (
  id TEXT PRIMARY KEY,
  sales_order_id TEXT REFERENCES sales_orders(id),
  customer_id TEXT REFERENCES customers(id),
  delivery_type TEXT,
  actual_delivery_date TEXT,
  storage_location TEXT,
  plant TEXT
);

CREATE TABLE billing_documents (
  id TEXT PRIMARY KEY,
  sales_order_id TEXT REFERENCES sales_orders(id),
  delivery_id TEXT REFERENCES deliveries(id),
  billing_type TEXT,
  billing_date TEXT,
  net_value REAL,
  currency TEXT,
  payer_id TEXT REFERENCES customers(id)
);

CREATE TABLE journal_entries (
  id TEXT PRIMARY KEY,
  billing_document_id TEXT REFERENCES billing_documents(id),
  company_code TEXT,
  fiscal_year TEXT,
  posting_date TEXT,
  currency TEXT,
  amount REAL
);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  billing_document_id TEXT REFERENCES billing_documents(id),
  company_code TEXT,
  clearing_date TEXT,
  amount REAL,
  currency TEXT
);

CREATE TABLE materials (
  id TEXT PRIMARY KEY,        -- MATNR
  name TEXT,
  unit TEXT,
  type TEXT,
  material_class TEXT
);

CREATE TABLE sales_order_items (
  id TEXT PRIMARY KEY,
  sales_order_id TEXT REFERENCES sales_orders(id),
  material_id TEXT REFERENCES materials(id),
  quantity REAL,
  net_value REAL
);
```

### What I changed

- AI used `INTEGER PRIMARY KEY` for some tables — I changed all to `TEXT` since SAP IDs are alphanumeric (e.g. `0000012345`)
- Added `sales_order_items` as a junction table the AI initially missed
- Renamed columns to be more readable (`KUNNR` → `customer_id`) — the AI suggested keeping SAP names, but I overrode this for LLM-friendliness

---

## Prompt 3

> Now write the CREATE TABLE statements as a single migration script, and add indexes on all foreign key columns for query performance.

### AI Response

Produced `schema.sql` with all tables + indexes like:

```sql
CREATE INDEX idx_sales_orders_customer ON sales_orders(customer_id);
CREATE INDEX idx_deliveries_sales_order ON deliveries(sales_order_id);
CREATE INDEX idx_billing_sales_order ON billing_documents(sales_order_id);
-- etc.
```

I accepted this mostly as-is and saved it to `backend/src/db/schema.sql`.

---

## Key Decisions from This Session

1. **SQLite over Neo4j** — LLM SQL generation is more reliable than Cypher
2. **Readable column names** — better for LLM prompt injection
3. **All IDs as TEXT** — SAP IDs are not integers
4. **FK indexes on all join columns** — the AI proactively added these, which I kept

---

## Files Created

- `backend/src/db/schema.sql`
