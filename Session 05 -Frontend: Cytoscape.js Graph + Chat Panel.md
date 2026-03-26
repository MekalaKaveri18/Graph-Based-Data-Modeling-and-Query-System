# Session 05 — Frontend: Cytoscape.js Graph + Chat Panel

**Date:** 2026-03-25  
**Tool:** Claude.ai  
**Duration:** ~1.5 hours  
**Goal:** Build the React frontend with Cytoscape.js graph visualization, node inspector, and chat panel

---

## Context

I had the backend working. Now I needed the frontend — a split-panel layout with the graph on the left, chat on the right, and a node detail panel that appears on click.

---

## Prompt 1 — Layout

> Build a React component with a split layout:
> - Left: graph canvas (Cytoscape.js) taking ~65% width
> - Right: chat panel with message history and input, taking ~35% width
> - When a node is clicked, show a slide-in panel at the bottom of the graph area with that node's metadata
> - Use plain CSS, no Tailwind or styled-components

### AI Response

Generated `App.jsx` with the split layout and a `NodeInspector` component. The Cytoscape initialization:

```javascript
useEffect(() => {
  if (!cyRef.current || !graphData) return;

  const cy = cytoscape({
    container: cyRef.current,
    elements: [...graphData.nodes, ...graphData.edges],
    style: [
      {
        selector: 'node',
        style: {
          'background-color': 'data(color)',
          'label': 'data(label)',
          'font-size': '10px',
          'color': '#fff',
          'text-valign': 'center',
          'text-halign': 'center',
          'width': 40,
          'height': 40
        }
      },
      {
        selector: 'edge',
        style: {
          'curve-style': 'bezier',
          'target-arrow-shape': 'triangle',
          'line-color': '#aaa',
          'target-arrow-color': '#aaa',
          'label': 'data(label)',
          'font-size': '8px'
        }
      }
    ],
    layout: { name: 'cose', animate: true }
  });

  cy.on('tap', 'node', (e) => {
    setSelectedNode(e.target.data());
  });

  cyInstance.current = cy;
}, [graphData]);
```

### What I Changed

- AI used `cose` layout by default — switched to `cose-bilkent` after testing, it handles larger graphs better without node overlap
- Added a color map for node types:

```javascript
const NODE_COLORS = {
  customer: '#7c3aed',
  sales_order: '#0d9488',
  sales_order_item: '#5eead4',
  delivery: '#2563eb',
  billing_document: '#d97706',
  journal_entry: '#f87171',
  material: '#ec4899',
  payment: '#16a34a'
};
```

- The AI rendered node labels as full IDs — I changed this to show human-readable labels (customer name, not customer ID)

---

## Prompt 2 — Node Highlighting

> When the chat returns referenced_ids like ["SO-001", "M-005"], I want to highlight those nodes in the graph. Write a function that takes an array of IDs, finds the matching Cytoscape nodes, and applies a highlight style. Non-highlighted nodes should dim. After 5 seconds, reset to normal.

### AI Response

```javascript
function highlightNodes(cy, ids) {
  if (!cy || !ids.length) return;
  
  cy.elements().addClass('dimmed');
  
  ids.forEach(id => {
    // IDs in cy are prefixed: "customer:CUST-001"
    cy.nodes().forEach(node => {
      const nodeData = node.data();
      if (nodeData.id.endsWith(`:${id}`) || nodeData.id === id) {
        node.removeClass('dimmed');
        node.addClass('highlighted');
      }
    });
  });

  setTimeout(() => {
    cy.elements().removeClass('dimmed highlighted');
  }, 5000);
}
```

CSS classes:
```javascript
{ selector: '.highlighted', style: { 'border-width': 3, 'border-color': '#f59e0b', 'background-color': '#fef08a' } },
{ selector: '.dimmed', style: { 'opacity': 0.2 } }
```

### Issue I Found

The ID matching was brittle — the graph stored IDs as `customer:CUST-001` but the LLM returned bare IDs like `CUST-001`. The AI's `endsWith` check was a patch. I rewrote it to strip the type prefix properly:

```javascript
const bareId = nodeData.id.split(':').pop();
if (ids.includes(bareId)) { ... }
```

---

## Prompt 3 — Chat Panel

> Build a ChatPanel React component with:
> - Scrollable message history (user messages right-aligned, assistant left-aligned)
> - A text input with send button
> - Show a loading indicator while waiting for the API response
> - Display the SQL query that was executed (collapsed by default, expandable)

### AI Response

Generated a clean `ChatPanel.jsx`. The collapsible SQL section:

```jsx
{message.sql && (
  <details className="sql-block">
    <summary>View SQL query</summary>
    <pre>{message.sql}</pre>
  </details>
)}
```

I kept this almost as-is — simple and functional. Added one thing: a "copy SQL" button the AI didn't include.

---

## Debugging Session

**Problem:** After the graph loaded, clicking "Expand" on a node would add duplicate nodes if the node was already in the graph.

**Prompt:**
> When I expand a node by clicking "Expand" button in the inspector, the /api/node/:type/:id/expand response adds duplicate nodes to Cytoscape. How do I prevent this?

**AI Answer:**
> "Before adding new elements, filter out any nodes/edges whose IDs already exist in the Cytoscape instance."

```javascript
function mergeIntoGraph(cy, newElements) {
  const existingIds = new Set(cy.elements().map(el => el.id()));
  const fresh = newElements.filter(el => !existingIds.has(el.data.id));
  cy.add(fresh);
  cy.layout({ name: 'cose-bilkent', animate: true }).run();
}
```

Worked perfectly.

---

## Key Decisions

- **cose-bilkent over cose** — better layout for medium-sized graphs
- **Type-prefixed IDs in Cytoscape** — prevents collisions when two entity types share an ID value
- **Collapsible SQL display** — shows transparency without cluttering the chat

---

## Files Created

- `frontend/src/App.jsx`
- `frontend/src/components/ChatPanel.jsx`
- `frontend/src/components/NodeInspector.jsx`
- `frontend/src/components/GraphCanvas.jsx`
- `frontend/src/styles/app.css`
