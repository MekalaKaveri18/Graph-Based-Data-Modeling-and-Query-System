# Session 02 — Data Ingestion Script

**Date:** March 25, 2026
**Tool:** Claude.ai  
**Duration:** ~30 mins  
**Goal:** Write a Node.js ingestion script that reads CSV/XLSX files and loads them into SQLite with fuzzy filename matching

---

## Context

My dataset files had inconsistent names like `SD_Deliveries_Export_v2.xlsx`, `FI_BillingDocs.csv`, `Customer_Master.xlsx`. I needed a script that didn't require me to manually map each filename to a table.

---

## Prompt 1

> Write a Node.js ingestion script that:
> 1. Reads all CSV and XLSX files from a /data directory
> 2. Fuzzy-matches filenames to known SQLite table names (sales_orders, deliveries, billing_documents, journal_entries, customers, materials, payments, sales_order_items)
> 3. Inserts rows using better-sqlite3
> 4. Handles multi-sheet Excel files (check each sheet name too)
> 5. Logs how many rows were inserted per table

### Claude's Generated Code (key parts)

```javascript
const TABLE_KEYWORDS = {
  sales_orders: ['sales_order', 'so_header', 'order_header', 'vbak'],
  sales_order_items: ['sales_order_item', 'so_item', 'order_item', 'vbap'],
  deliveries: ['delivery', 'deliveries', 'likp', 'lips'],
  billing_documents: ['billing', 'invoice', 'vbrk', 'vbrp', 'fi_billing'],
  journal_entries: ['journal', 'fi_document', 'bkpf', 'bseg', 'gl_entry'],
  customers: ['customer', 'kna1', 'debitor'],
  materials: ['material', 'product', 'mara', 'makt'],
  payments: ['payment', 'clearing', 'payr']
};

function matchFileToTable(filename) {
  const lower = filename.toLowerCase().replace(/[^a-z0-9]/g, '_');
  for (const [table, keywords] of Object.entries(TABLE_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return table;
  }
  return null;
}
```

Claude also generated the full insert loop with `INSERT OR REPLACE` and column name normalization (lowercasing, replacing spaces with underscores).

### What I Changed

1. **Column name normalization**: Claude's version only lowercased. My actual data had column names like `Sales Order` with spaces — I added `.replace(/\s+/g, '_')` and `.replace(/[^a-z0-9_]/g, '')` 
2. **Added SAP table codes** (VBAK, VBAP, LIKP etc.) to the keyword map — Claude didn't know my files used SAP export names. I added these after seeing the actual filenames.
3. **Error handling**: Claude's version crashed on malformed rows. I wrapped the insert in try/catch per row and added a `--skip-errors` flag.

---

## Prompt 2

> The script is failing on some XLSX files with the error: "Cannot read properties of undefined (reading 'forEach')". The file has merged cells in the header row. How do I handle this?

### Claude's Response

```javascript
// Claude's fix: skip non-data rows and handle merged cells
function extractRows(worksheet) {
  const rows = [];
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
  
  // Find actual header row (first row with multiple non-empty cells)
  let headerRow = 0;
  for (let r = range.s.r; r <= Math.min(range.s.r + 5, range.e.r); r++) {
    const cellsInRow = Object.keys(worksheet)
      .filter(k => !k.startsWith('!') && XLSX.utils.decode_cell(k).r === r)
      .length;
    if (cellsInRow > 2) { headerRow = r; break; }
  }
  // ... rest of extraction
}
```

This fixed the issue. The dataset had some sheets with a title row above the actual column headers.

---

## Prompt 3

> After ingestion, I want to verify data integrity. Write a quick SQL validation script that checks: 1) FK references that don't resolve, 2) tables with 0 rows, 3) duplicate IDs

### Claude's Response

Generated a validation script that ran 15 checks:
```sql
-- Example checks Claude generated
SELECT COUNT(*) FROM sales_order_items WHERE sales_order_id NOT IN (SELECT id FROM sales_orders);
SELECT COUNT(*) FROM deliveries WHERE sales_order_id NOT IN (SELECT id FROM sales_orders);
SELECT COUNT(*) FROM billing_documents WHERE delivery_id IS NOT NULL 
  AND delivery_id NOT IN (SELECT id FROM deliveries);
```

Found 3 orphaned `billing_documents` rows referencing non-existent `delivery_id`s. Decided to set those `delivery_id`s to NULL (valid business scenario per Session 01).

---

## Outcome

- Ingestion script handles 8 entity types with fuzzy name matching
- Auto-detects and skips title rows in Excel files
- 0 unresolved FK references after cleanup
- ~12,000 total rows ingested across all tables
