import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'data', 'graph.db');

let _db = null;

export async function getDb() {
  if (_db) return _db;
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    _db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    _db = new SQL.Database();
    initSchema(_db);
    saveDb(_db);
  }
  return _db;
}

export function saveDb(db) {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

export function initSchema(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS sales_order_headers (
      salesOrder TEXT PRIMARY KEY, salesOrderType TEXT, salesOrganization TEXT,
      soldToParty TEXT, creationDate TEXT, totalNetAmount REAL,
      transactionCurrency TEXT, overallDeliveryStatus TEXT,
      overallOrdReltdBillgStatus TEXT, requestedDeliveryDate TEXT, customerPaymentTerms TEXT
    );
    CREATE TABLE IF NOT EXISTS sales_order_items (
      salesOrder TEXT, salesOrderItem TEXT, material TEXT,
      requestedQuantity REAL, requestedQuantityUnit TEXT, netAmount REAL,
      transactionCurrency TEXT, productionPlant TEXT, storageLocation TEXT,
      PRIMARY KEY (salesOrder, salesOrderItem)
    );
    CREATE TABLE IF NOT EXISTS outbound_delivery_headers (
      deliveryDocument TEXT PRIMARY KEY, creationDate TEXT, shippingPoint TEXT,
      overallGoodsMovementStatus TEXT, overallPickingStatus TEXT,
      headerBillingBlockReason TEXT, deliveryBlockReason TEXT
    );
    CREATE TABLE IF NOT EXISTS outbound_delivery_items (
      deliveryDocument TEXT, deliveryDocumentItem TEXT,
      referenceSdDocument TEXT, referenceSdDocumentItem TEXT,
      material TEXT, actualDeliveryQuantity REAL, deliveryQuantityUnit TEXT,
      plant TEXT, storageLocation TEXT,
      PRIMARY KEY (deliveryDocument, deliveryDocumentItem)
    );
    CREATE TABLE IF NOT EXISTS billing_document_headers (
      billingDocument TEXT PRIMARY KEY, billingDocumentType TEXT,
      creationDate TEXT, billingDocumentDate TEXT,
      billingDocumentIsCancelled INTEGER, totalNetAmount REAL,
      transactionCurrency TEXT, companyCode TEXT, fiscalYear TEXT,
      accountingDocument TEXT, soldToParty TEXT
    );
    CREATE TABLE IF NOT EXISTS billing_document_items (
      billingDocument TEXT, billingDocumentItem TEXT, material TEXT,
      billingQuantity REAL, billingQuantityUnit TEXT, netAmount REAL,
      transactionCurrency TEXT, referenceSdDocument TEXT, referenceSdDocumentItem TEXT,
      PRIMARY KEY (billingDocument, billingDocumentItem)
    );
    CREATE TABLE IF NOT EXISTS billing_document_cancellations (
      billingDocument TEXT PRIMARY KEY, cancelledBillingDocument TEXT,
      creationDate TEXT, companyCode TEXT, soldToParty TEXT, totalNetAmount REAL
    );
    CREATE TABLE IF NOT EXISTS journal_entry_items (
      accountingDocument TEXT, accountingDocumentItem TEXT,
      companyCode TEXT, fiscalYear TEXT, glAccount TEXT,
      referenceDocument TEXT, amountInTransactionCurrency REAL,
      transactionCurrency TEXT, postingDate TEXT, customer TEXT,
      clearingDate TEXT, clearingAccountingDocument TEXT,
      PRIMARY KEY (accountingDocument, accountingDocumentItem)
    );
    CREATE TABLE IF NOT EXISTS payments (
      accountingDocument TEXT, accountingDocumentItem TEXT,
      companyCode TEXT, fiscalYear TEXT, clearingDate TEXT,
      clearingAccountingDocument TEXT, amountInTransactionCurrency REAL,
      transactionCurrency TEXT, customer TEXT, invoiceReference TEXT,
      salesDocument TEXT, postingDate TEXT,
      PRIMARY KEY (accountingDocument, accountingDocumentItem)
    );
    CREATE TABLE IF NOT EXISTS business_partners (
      businessPartner TEXT PRIMARY KEY, customer TEXT,
      businessPartnerFullName TEXT, businessPartnerName TEXT,
      businessPartnerCategory TEXT, creationDate TEXT,
      businessPartnerIsBlocked INTEGER
    );
    CREATE TABLE IF NOT EXISTS products (
      product TEXT PRIMARY KEY, productType TEXT, productOldId TEXT,
      grossWeight REAL, weightUnit TEXT, productGroup TEXT,
      baseUnit TEXT, division TEXT
    );
    CREATE TABLE IF NOT EXISTS plants (
      plant TEXT PRIMARY KEY, plantName TEXT, country TEXT, city TEXT
    );
  `);
}

function readJsonl(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .split('\n').filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

function flatten(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) out[k] = null;
    else if (typeof v === 'object') out[k] = JSON.stringify(v);
    else out[k] = v;
  }
  return out;
}

function insertRows(db, table, rows) {
  if (!rows.length) return 0;
  const colResult = db.exec(`PRAGMA table_info(${table})`);
  if (!colResult.length) return 0;
  const validCols = new Set(colResult[0].values.map(r => r[1]));
  const cols = Object.keys(flatten(rows[0])).filter(c => validCols.has(c));
  if (!cols.length) return 0;
  const sql = `INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`;
  const stmt = db.prepare(sql);
  let count = 0;
  for (const row of rows) {
    const flat = flatten(row);
    try { stmt.run(cols.map(c => flat[c] !== undefined ? flat[c] : null)); count++; } catch {}
  }
  stmt.free();
  return count;
}

const FOLDER_TABLE_MAP = {
  sales_order_headers: 'sales_order_headers',
  sales_order_items: 'sales_order_items',
  outbound_delivery_headers: 'outbound_delivery_headers',
  outbound_delivery_items: 'outbound_delivery_items',
  billing_document_headers: 'billing_document_headers',
  billing_document_items: 'billing_document_items',
  billing_document_cancellations: 'billing_document_cancellations',
  journal_entry_items_accounts_receivable: 'journal_entry_items',
  payments_accounts_receivable: 'payments',
  business_partners: 'business_partners',
  products: 'products',
  plants: 'plants',
};

export async function ingestDataDirectory(dirPath) {
  const db = await getDb();
  initSchema(db);
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  let total = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const table = FOLDER_TABLE_MAP[entry.name];
    if (!table) { console.log('  Skipping: ' + entry.name); continue; }
    const subDir = path.join(dirPath, entry.name);
    const files = fs.readdirSync(subDir).filter(f => f.endsWith('.jsonl'));
    let rows = [];
    for (const f of files) rows.push(...readJsonl(path.join(subDir, f)));
    const count = insertRows(db, table, rows);
    console.log('  ' + entry.name + ' -> ' + table + ': ' + count + ' rows');
    total += count;
  }
  saveDb(db);
  console.log('\nDone. Total rows: ' + total);
}

export async function getDbStats() {
  const db = await getDb();
  const tables = ['sales_order_headers','sales_order_items','outbound_delivery_headers',
    'outbound_delivery_items','billing_document_headers','billing_document_items',
    'journal_entry_items','payments','business_partners','products','plants'];
  const stats = {};
  for (const t of tables) {
    try { const r = db.exec('SELECT COUNT(*) FROM ' + t); stats[t] = r[0]?.values[0][0] ?? 0; }
    catch { stats[t] = 0; }
  }
  return stats;
}

export async function runQuery(sql) {
  const db = await getDb();
  if (!sql.trim().toUpperCase().startsWith('SELECT'))
    throw new Error('Only SELECT queries are permitted');
  const result = db.exec(sql);
  if (!result.length) return [];
  const { columns, values } = result[0];
  return values.map(row => Object.fromEntries(columns.map((c, i) => [c, row[i]])));
}

export function getSchemaDescription() {
  return `
DATABASE SCHEMA (SQLite) - SAP Order-to-Cash dataset:

TABLE: sales_order_headers
  salesOrder TEXT PK
  soldToParty TEXT (matches business_partners.customer)
  totalNetAmount REAL, transactionCurrency TEXT, creationDate TEXT
  overallDeliveryStatus TEXT  -- 'C'=fully delivered, 'B'=partial, 'A'=not started, ''=none
  overallOrdReltdBillgStatus TEXT  -- 'C'=fully billed, 'B'=partial, ''=not billed

TABLE: sales_order_items
  salesOrder TEXT (matches sales_order_headers.salesOrder)
  salesOrderItem TEXT
  material TEXT (matches products.product AND billing_document_items.material)
  requestedQuantity REAL, netAmount REAL, productionPlant TEXT

TABLE: outbound_delivery_headers
  deliveryDocument TEXT PK
  creationDate TEXT, shippingPoint TEXT
  overallGoodsMovementStatus TEXT, overallPickingStatus TEXT

TABLE: outbound_delivery_items
  deliveryDocument TEXT (matches outbound_delivery_headers.deliveryDocument)
  deliveryDocumentItem TEXT
  referenceSdDocument TEXT (matches sales_order_headers.salesOrder)
  material TEXT, actualDeliveryQuantity REAL

TABLE: billing_document_headers
  billingDocument TEXT PK
  billingDocumentDate TEXT, totalNetAmount REAL, transactionCurrency TEXT
  billingDocumentIsCancelled INTEGER  -- 0=active, 1=cancelled
  accountingDocument TEXT (matches journal_entry_items.accountingDocument)
  soldToParty TEXT (matches business_partners.customer)

TABLE: billing_document_items
  billingDocument TEXT (matches billing_document_headers.billingDocument)
  billingDocumentItem TEXT
  material TEXT (matches products.product)
  billingQuantity REAL, netAmount REAL
  referenceSdDocument TEXT (matches outbound_delivery_headers.deliveryDocument)

TABLE: journal_entry_items
  accountingDocument TEXT
  accountingDocumentItem TEXT
  referenceDocument TEXT (matches billing_document_headers.billingDocument)
  glAccount TEXT, amountInTransactionCurrency REAL, postingDate TEXT
  customer TEXT, clearingDate TEXT, clearingAccountingDocument TEXT

TABLE: payments
  accountingDocument TEXT
  accountingDocumentItem TEXT
  clearingAccountingDocument TEXT
  amountInTransactionCurrency REAL, transactionCurrency TEXT
  customer TEXT (matches business_partners.customer)
  postingDate TEXT, clearingDate TEXT

TABLE: business_partners
  businessPartner TEXT PK
  customer TEXT (same value as businessPartner, used as FK in other tables)
  businessPartnerFullName TEXT, businessPartnerName TEXT

TABLE: products
  product TEXT PK  (matches billing_document_items.material AND sales_order_items.material)
  productOldId TEXT, productType TEXT, productGroup TEXT, baseUnit TEXT

TABLE: plants
  plant TEXT PK, plantName TEXT, country TEXT, city TEXT

VERIFIED JOIN PATHS (use exactly these):

-- Products with billing documents:
SELECT p.product, p.productOldId, COUNT(DISTINCT bdi.billingDocument) as billing_count
FROM products p
JOIN billing_document_items bdi ON bdi.material = p.product
GROUP BY p.product, p.productOldId
ORDER BY billing_count DESC

-- Full O2C flow trace for a billing document:
SELECT
  soh.salesOrder, bp.businessPartnerFullName as customer,
  odh.deliveryDocument, bdh.billingDocument,
  je.accountingDocument as journalEntry,
  bdh.totalNetAmount, bdh.transactionCurrency
FROM billing_document_headers bdh
JOIN billing_document_items bdi ON bdi.billingDocument = bdh.billingDocument
JOIN outbound_delivery_headers odh ON odh.deliveryDocument = bdi.referenceSdDocument
JOIN outbound_delivery_items odi ON odi.deliveryDocument = odh.deliveryDocument
JOIN sales_order_headers soh ON soh.salesOrder = odi.referenceSdDocument
JOIN business_partners bp ON bp.customer = soh.soldToParty
LEFT JOIN journal_entry_items je ON je.referenceDocument = bdh.billingDocument
WHERE bdh.billingDocument = '90504248'
LIMIT 10

-- Sales orders delivered but not billed (incomplete flow):
SELECT soh.salesOrder, soh.soldToParty, soh.totalNetAmount,
  soh.overallDeliveryStatus, soh.overallOrdReltdBillgStatus
FROM sales_order_headers soh
WHERE soh.overallDeliveryStatus = 'C'
AND (soh.overallOrdReltdBillgStatus = '' OR soh.overallOrdReltdBillgStatus IS NULL)

-- Sales orders billed without delivery:
SELECT soh.salesOrder, bdh.billingDocument, bdh.totalNetAmount
FROM sales_order_headers soh
JOIN billing_document_headers bdh ON bdh.soldToParty = soh.soldToParty
LEFT JOIN outbound_delivery_items odi ON odi.referenceSdDocument = soh.salesOrder
WHERE odi.deliveryDocument IS NULL
LIMIT 20
`.trim();
}
