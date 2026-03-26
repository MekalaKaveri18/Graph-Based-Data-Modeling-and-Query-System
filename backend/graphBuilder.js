import { getDb } from './dataIngestion.js';

const NODE_TYPES = {
  business_partner:    { color: '#7F77DD' },
  sales_order:         { color: '#1D9E75' },
  sales_order_item:    { color: '#5DCAA5' },
  delivery:            { color: '#378ADD' },
  billing_document:    { color: '#EF9F27' },
  journal_entry:       { color: '#D85A30' },
  product:             { color: '#D4537E' },
  payment:             { color: '#639922' },
};

function nid(type, id) { return `${type}::${id}`; }

function label(type, row) {
  switch (type) {
    case 'business_partner': return row.businessPartnerFullName || row.businessPartner;
    case 'sales_order':      return `SO-${row.salesOrder}`;
    case 'sales_order_item': return `SO-${row.salesOrder}/${row.salesOrderItem}`;
    case 'delivery':         return `DEL-${row.deliveryDocument}`;
    case 'billing_document': return `BILL-${row.billingDocument}`;
    case 'journal_entry':    return `JE-${row.accountingDocument}`;
    case 'product':          return row.productOldId || row.product;
    case 'payment':          return `PAY-${row.accountingDocument}`;
    default:                 return Object.values(row)[0];
  }
}

function query(db, sql) {
  const r = db.exec(sql);
  if (!r.length) return [];
  return r[0].values.map(row => Object.fromEntries(r[0].columns.map((c, i) => [c, row[i]])));
}

export async function getGraphData(limit = 40) {
  const db = await getDb();
  const nodes = [], edges = [], seen = new Set();

  function addNode(type, row, idField) {
    const id = row[idField];
    const nodeId = nid(type, id);
    if (seen.has(nodeId)) return nodeId;
    seen.add(nodeId);
    nodes.push({ id: nodeId, type, entityId: id, label: label(type, row), data: row, ...NODE_TYPES[type] });
    return nodeId;
  }

  function addEdge(src, tgt, lbl) {
    const eid = `${src}--${tgt}`;
    edges.push({ id: eid, source: src, target: tgt, label: lbl });
  }

  const partners  = query(db, `SELECT * FROM business_partners LIMIT ${limit}`);
  const orders    = query(db, `SELECT * FROM sales_order_headers LIMIT ${limit}`);
  const items     = query(db, `SELECT * FROM sales_order_items LIMIT ${limit * 2}`);
  const delivs    = query(db, `SELECT * FROM outbound_delivery_headers LIMIT ${limit}`);
  const delivItems= query(db, `SELECT * FROM outbound_delivery_items LIMIT ${limit * 2}`);
  const bills     = query(db, `SELECT * FROM billing_document_headers LIMIT ${limit}`);
  const journals  = query(db, `SELECT * FROM journal_entry_items LIMIT ${limit}`);
  const products  = query(db, `SELECT * FROM products LIMIT ${limit}`);
  const pays      = query(db, `SELECT * FROM payments LIMIT ${limit}`);

  for (const r of partners) addNode('business_partner', r, 'businessPartner');
  for (const r of orders)   addNode('sales_order', r, 'salesOrder');
  for (const r of delivs)   addNode('delivery', r, 'deliveryDocument');
  for (const r of bills)    addNode('billing_document', r, 'billingDocument');
  for (const r of products) addNode('product', r, 'product');

  // Edges: partner → order
  for (const o of orders) {
    const pNid = nid('business_partner', o.soldToParty);
    if (seen.has(pNid)) addEdge(pNid, nid('sales_order', o.salesOrder), 'placed');
  }

  // Edges: order → items → products
  for (const i of items) {
    const soNid = nid('sales_order', i.salesOrder);
    if (!seen.has(soNid)) continue;
    const itemNid = nid('sales_order_item', `${i.salesOrder}-${i.salesOrderItem}`);
    if (!seen.has(itemNid)) {
      seen.add(itemNid);
      nodes.push({ id: itemNid, type: 'sales_order_item', entityId: `${i.salesOrder}-${i.salesOrderItem}`, label: label('sales_order_item', i), data: i, ...NODE_TYPES['sales_order_item'] });
    }
    addEdge(soNid, itemNid, 'contains');
    const pNid = nid('product', i.material);
    if (seen.has(pNid)) addEdge(itemNid, pNid, 'material');
  }

  // Edges: order → delivery (via delivery items referenceSDDocument)
  for (const di of delivItems) {
    const soNid = nid('sales_order', di.referenceSDDocument);
    const delNid = nid('delivery', di.deliveryDocument);
    if (seen.has(soNid) && seen.has(delNid)) addEdge(soNid, delNid, 'delivered via');
  }

  // Edges: delivery → billing (via billing items referenceSdDocument)
  for (const b of bills) {
    const billNid = nid('billing_document', b.billingDocument);
    // find associated delivery via billing_document_items
    const billItems = query(db, `SELECT referenceSdDocument FROM billing_document_items WHERE billingDocument='${b.billingDocument}' LIMIT 1`);
    if (billItems.length) {
      const delNid = nid('delivery', billItems[0].referenceSdDocument);
      if (seen.has(delNid)) addEdge(delNid, billNid, 'billed via');
    }
    // also link billing → order via soldToParty context
  }

  // Edges: billing → journal
  for (const j of journals) {
    const jNid = nid('journal_entry', j.accountingDocument);
    if (!seen.has(jNid)) {
      seen.add(jNid);
      nodes.push({ id: jNid, type: 'journal_entry', entityId: j.accountingDocument, label: label('journal_entry', j), data: j, ...NODE_TYPES['journal_entry'] });
    }
    const billNid = nid('billing_document', j.referenceDocument);
    if (seen.has(billNid)) addEdge(billNid, jNid, 'posts to');
  }

  // Edges: journal → payment
  for (const p of pays) {
    const payNid = nid('payment', p.accountingDocument);
    if (!seen.has(payNid)) {
      seen.add(payNid);
      nodes.push({ id: payNid, type: 'payment', entityId: p.accountingDocument, label: label('payment', p), data: p, ...NODE_TYPES['payment'] });
    }
    // payment clears a journal entry
    const jNid = nid('journal_entry', p.clearingAccountingDocument);
    if (seen.has(jNid)) addEdge(jNid, payNid, 'cleared by');
  }

  return { nodes, edges };
}

export async function getNodeDetail(type, id) {
  const db = await getDb();
  const queries = {
    business_partner:  `SELECT * FROM business_partners WHERE businessPartner='${id}'`,
    sales_order:       `SELECT * FROM sales_order_headers WHERE salesOrder='${id}'`,
    delivery:          `SELECT * FROM outbound_delivery_headers WHERE deliveryDocument='${id}'`,
    billing_document:  `SELECT * FROM billing_document_headers WHERE billingDocument='${id}'`,
    journal_entry:     `SELECT * FROM journal_entry_items WHERE accountingDocument='${id}' LIMIT 1`,
    product:           `SELECT * FROM products WHERE product='${id}'`,
    payment:           `SELECT * FROM payments WHERE accountingDocument='${id}' LIMIT 1`,
  };
  const sql = queries[type];
  if (!sql) return null;
  const db2 = await getDb();
  const r = db2.exec(sql);
  if (!r.length || !r[0].values.length) return null;
  const row = Object.fromEntries(r[0].columns.map((c, i) => [c, r[0].values[0][i]]));
  return { type, entityId: id, label: label(type, row), color: NODE_TYPES[type]?.color, data: row };
}

export async function expandNode(type, id) {
  const db = await getDb();
  const nodes = [], edges = [];
  const parentNid = nid(type, id);
  const safeId = String(id).replace(/'/g, "''");

  function push(t, row, idField) {
    const nodeId = nid(t, row[idField]);
    nodes.push({ id: nodeId, type: t, entityId: row[idField], label: label(t, row), data: row, ...NODE_TYPES[t] });
    return nodeId;
  }
  function pushEdge(s, t, l) { edges.push({ id: `${s}--${t}`, source: s, target: t, label: l }); }

  function q(sql) {
    const r = db.exec(sql);
    if (!r.length) return [];
    return r[0].values.map(row => Object.fromEntries(r[0].columns.map((c, i) => [c, row[i]])));
  }

  if (type === 'sales_order') {
    for (const r of q(`SELECT * FROM sales_order_items WHERE salesOrder='${safeId}'`)) {
      const n = push('sales_order_item', {...r, entityId: `${r.salesOrder}-${r.salesOrderItem}`}, 'salesOrder');
      pushEdge(parentNid, nid('sales_order_item', `${r.salesOrder}-${r.salesOrderItem}`), 'contains');
    }
    for (const r of q(`SELECT odh.* FROM outbound_delivery_headers odh JOIN outbound_delivery_items odi ON odh.deliveryDocument=odi.deliveryDocument WHERE odi.referenceSDDocument='${safeId}' LIMIT 10`)) {
      push('delivery', r, 'deliveryDocument');
      pushEdge(parentNid, nid('delivery', r.deliveryDocument), 'delivered via');
    }
  }
  if (type === 'delivery') {
    for (const r of q(`SELECT bdh.* FROM billing_document_headers bdh JOIN billing_document_items bdi ON bdh.billingDocument=bdi.billingDocument WHERE bdi.referenceSdDocument='${safeId}' LIMIT 10`)) {
      push('billing_document', r, 'billingDocument');
      pushEdge(parentNid, nid('billing_document', r.billingDocument), 'billed via');
    }
  }
  if (type === 'billing_document') {
    for (const r of q(`SELECT * FROM journal_entry_items WHERE referenceDocument='${safeId}' LIMIT 10`)) {
      push('journal_entry', r, 'accountingDocument');
      pushEdge(parentNid, nid('journal_entry', r.accountingDocument), 'posts to');
    }
    for (const r of q(`SELECT * FROM payments WHERE invoiceReference='${safeId}' LIMIT 10`)) {
      push('payment', r, 'accountingDocument');
      pushEdge(parentNid, nid('payment', r.accountingDocument), 'settled by');
    }
  }
  if (type === 'business_partner') {
    for (const r of q(`SELECT * FROM sales_order_headers WHERE soldToParty='${safeId}' LIMIT 20`)) {
      push('sales_order', r, 'salesOrder');
      pushEdge(parentNid, nid('sales_order', r.salesOrder), 'placed');
    }
  }
  if (type === 'product') {
    for (const r of q(`SELECT * FROM sales_order_items WHERE material='${safeId}' LIMIT 20`)) {
      push('sales_order_item', r, 'salesOrder');
      pushEdge(nid('sales_order_item', `${r.salesOrder}-${r.salesOrderItem}`), parentNid, 'material');
    }
  }

  return { nodes, edges };
}
