# Session 03 — In-Memory Graph Construction

**Date:** 2026-03-25  
**Tool:** Claude.ai  
**Duration:** ~40 mins  
**Goal:** Build the graph layer — derive nodes and edges from FK relationships in SQLite, expose via /api/graph

---

## Context

The schema had all FK relationships defined. I wanted to derive the graph automatically from those relationships rather than hardcoding edge definitions. The graph only needed to exist in memory — it's rebuilt on server start from the DB.

---

## Prompt 1

> I have a SQLite database with these tables and FK relationships:
> - customers → sales_orders (customer_id)
> - sales_orders → sales_order_items (sales_order_id)
> - sales_order_items → materials (material_id)
> - sales_orders → deliveries (sales_order_id)
> - sales_orders → billing_documents (sales_order_id)
> - deliveries → billing_documents (delivery_id)
> - billing_documents → journal_entries (billing_document_id)
> - billing_documents → payments (billing_document_id)
>
> Write a Node.js module that queries the DB and builds an in-memory graph as { nodes: [], edges: [] } in a format compatible with Cytoscape.js. Each node should have id, type, label, and a data object with all fields. Edges should have source, target, and relationship label.

### AI Response

Generated `graph-builder.js`:

```javascript
async function buildGraph(db, limit = 50) {
  const nodes = [];
  const edges = [];
  const seen = new Set();

  function addNode(id, type, label, data) {
    const uid = `${type}:${id}`;
    if (seen.has(uid)) return;
    seen.add(uid);
    nodes.push({ data: { id: uid, type, label, ...data } });
  }

  // Customers
  const customers = db.prepare('SELECT * FROM customers LIMIT ?').all(limit);
  customers.forEach(c => addNode(c.id, 'customer', c.name || c.id, c));

  // Sales Orders
  const orders = db.prepare('SELECT * FROM sales_orders LIMIT ?').all(limit);
  orders.forEach(o => {
    addNode(o.id, 'sales_order', `SO ${o.id}`, o);
    edges.push({ data: {
      id: `e_customer_so_${o.id}`,
      source: `customer:${o.customer_id}`,
      target: `sales_order:${o.id}`,
      label: 'placed'
    }});
  });

  // ... pattern continues for all entity types
  
  return { nodes, edges };
}
```

### What I changed

- The AI defaulted to `LIMIT 100` everywhere. I changed this to a configurable parameter with a default of 50 — the graph gets slow in Cytoscape above ~200 nodes
- Added a `type` color map in a separate config file so the frontend could use consistent colors without hardcoding them in the graph builder
- The AI didn't handle orphaned nodes (e.g. a delivery whose sales_order_id doesn't exist in the loaded window). Added a guard:

```javascript
// Only add edge if both source and target nodes were added
if (seen.has(`sales_order:${d.sales_order_id}`)) {
  edges.push({ data: { ... } });
}
```

---

## Prompt 2

> Now write a /api/graph GET endpoint in Express that returns this graph. Also write a /api/node/:type/:id/expand endpoint that returns the 1-hop neighbours of a given node.

### AI Response

```javascript
// GET /api/graph
router.get('/graph', (req, res) => {
  const graph = buildGraph(db);
  res.json(graph);
});

// GET /api/node/:type/:id/expand
router.get('/node/:type/:id/expand', (req, res) => {
  const { type, id } = req.params;
  const neighbours = getNeighbours(db, type, id);
  res.json(neighbours);
});
```

For `getNeighbours`, the AI generated type-specific queries:

```javascript
function getNeighbours(db, type, id) {
  const nodes = [];
  const edges = [];
  
  if (type === 'sales_order') {
    const items = db.prepare(
      'SELECT * FROM sales_order_items WHERE sales_order_id = ?'
    ).all(id);
    // ... add items as nodes, add edges
    
    const delivery = db.prepare(
      'SELECT * FROM deliveries WHERE sales_order_id = ?'
    ).get(id);
    // ... etc
  }
  // ... other type branches
  
  return { nodes, edges };
}
```

### What I changed

- Refactored from `if/else` branches to a declarative relationship map. The AI's approach worked but would've been messy to maintain:

```javascript
const RELATIONSHIPS = {
  sales_order: [
    { table: 'sales_order_items', fk: 'sales_order_id', rel: 'contains', direction: 'out' },
    { table: 'deliveries', fk: 'sales_order_id', rel: 'fulfilled_by', direction: 'out' },
    { table: 'billing_documents', fk: 'sales_order_id', rel: 'billed_via', direction: 'out' },
  ],
  // ...
};
```

---

## Debugging Session

**Problem:** Graph returned duplicate edges when multiple items in a sales order referenced the same material.

**My prompt:**
> The /api/graph endpoint is returning duplicate edges. For example if two sales_order_items both reference material M001, I get two edges from SO-001 → M001. How do I deduplicate?

**AI fix:**
```javascript
const edgeSeen = new Set();
function addEdge(source, target, label) {
  const key = `${source}→${target}:${label}`;
  if (edgeSeen.has(key)) return;
  edgeSeen.add(key);
  edges.push({ data: { id: key, source, target, label } });
}
```

Simple and effective. Accepted as-is.

---

## Key Decisions

- **Graph derived from DB, not stored separately** — single source of truth, no sync issues
- **Configurable node limit** — performance guard for large datasets
- **Declarative relationship map** — easier to extend than branching conditionals
- **Edge deduplication** — prevents visual clutter in Cytoscape

---

## Files Created

- `backend/src/graph-builder.js`
- `backend/src/routes/graph.js`
