const LABELS = {
  sales_order_headers:'Sales Orders',
  outbound_delivery_headers:'Deliveries',
  billing_document_headers:'Billing Docs',
  payments:'Payments',
  business_partners:'Customers',
  products:'Products',
};
export default function StatsBar({ stats }) {
  const entries = Object.entries(LABELS).filter(([k]) => stats[k] > 0);
  if (!entries.length) return null;
  return (
    <div style={{ display:'flex', gap:24, alignItems:'center' }}>
      {entries.map(([k, lbl]) => (
        <div key={k} style={{ textAlign:'center' }}>
          <div style={{ fontSize:14, fontWeight:700, color:'#111827', lineHeight:1 }}>{stats[k].toLocaleString()}</div>
          <div style={{ fontSize:10, color:'#9ca3af', marginTop:2 }}>{lbl}</div>
        </div>
      ))}
    </div>
  );
}
