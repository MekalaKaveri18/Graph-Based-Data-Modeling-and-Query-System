const COLORS = {
  business_partner:'#6366f1', sales_order:'#0ea5e9',
  sales_order_item:'#38bdf8', delivery:'#3b82f6',
  billing_document:'#f59e0b', journal_entry:'#f97316',
  product:'#ec4899', payment:'#10b981',
};
const LABELS = {
  business_partner:'Customer', sales_order:'Sales Order',
  sales_order_item:'Order Item', delivery:'Delivery',
  billing_document:'Billing Document', journal_entry:'Journal Entry',
  product:'Product', payment:'Payment',
};

function camelToLabel(s) {
  return s.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase());
}

export default function NodeInspector({ node, onClose }) {
  if (!node) return null;
  const color = COLORS[node.type] || '#94a3b8';
  const typeLabel = LABELS[node.type] || node.type;
  const entries = Object.entries(node.data || {}).filter(([k,v]) => v !== null && v !== '' && v !== undefined && k !== 'id');
  const visible = entries.slice(0, 12);
  const hidden = entries.length - 12;

  return (
    <div style={{ width:300, background:'#fff', borderRadius:14, border:'1px solid #e8eaed', boxShadow:'0 8px 30px rgba(0,0,0,0.12)', overflow:'hidden' }}>
      {/* Header */}
      <div style={{ padding:'14px 16px 12px', borderBottom:'1px solid #f3f4f6' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <div style={{ display:'inline-flex', alignItems:'center', gap:5, background:color+'15', border:`1px solid ${color}30`, borderRadius:20, padding:'2px 10px', marginBottom:7 }}>
              <div style={{ width:6, height:6, borderRadius:'50%', background:color }} />
              <span style={{ fontSize:10, fontWeight:700, color, textTransform:'uppercase', letterSpacing:'0.5px' }}>{typeLabel}</span>
            </div>
            <div style={{ fontSize:14, fontWeight:600, color:'#111827', lineHeight:1.3 }}>{node.label}</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af', fontSize:20, lineHeight:1, padding:'0 0 0 8px', marginTop:-2 }}>×</button>
        </div>
      </div>

      {/* Fields */}
      <div style={{ maxHeight:300, overflowY:'auto' }}>
        {visible.map(([k, v]) => (
          <div key={k} style={{ display:'flex', gap:10, padding:'6px 16px', borderBottom:'1px solid #f9fafb' }}>
            <span style={{ fontSize:11, color:'#9ca3af', minWidth:120, flexShrink:0, paddingTop:1 }}>{camelToLabel(k)}</span>
            <span style={{ fontSize:12, color:'#111827', wordBreak:'break-all', lineHeight:1.5 }}>{String(v)}</span>
          </div>
        ))}
        {hidden > 0 && (
          <div style={{ padding:'6px 16px', fontSize:11, color:'#9ca3af', fontStyle:'italic', borderBottom:'1px solid #f9fafb' }}>
            {hidden} additional fields hidden for readability
          </div>
        )}
        <div style={{ padding:'8px 16px', fontSize:11, color:'#9ca3af' }}>
          Entity ID: {node.entityId}
        </div>
      </div>
    </div>
  );
}
