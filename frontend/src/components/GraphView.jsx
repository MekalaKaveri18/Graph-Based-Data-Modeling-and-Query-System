import { useEffect, useRef, useCallback } from 'react';
import cytoscape from 'cytoscape';

const COLORS = {
  business_partner: '#6366f1',
  sales_order:      '#0ea5e9',
  sales_order_item: '#38bdf8',
  delivery:         '#3b82f6',
  billing_document: '#f59e0b',
  journal_entry:    '#f97316',
  product:          '#ec4899',
  payment:          '#10b981',
};

const LEGEND = [
  ['business_partner','Customer'],
  ['sales_order','Sales Order'],
  ['delivery','Delivery'],
  ['billing_document','Billing Doc'],
  ['journal_entry','Journal Entry'],
  ['product','Product'],
  ['payment','Payment'],
  ['sales_order_item','Order Item'],
];

export default function GraphView({ nodes, edges, highlightedIds, onNodeSelect, onNodeExpand }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    cyRef.current = cytoscape({
      container: containerRef.current,
      elements: toElements(nodes, edges),
      style: getCyStyle(),
      layout: getLayout(),
      wheelSensitivity: 0.25,
      minZoom: 0.05,
      maxZoom: 6,
    });

    cyRef.current.on('tap', 'node', e => {
      cyRef.current.nodes().removeClass('selected');
      e.target.addClass('selected');
      onNodeSelect(e.target.data('raw'));
    });
    cyRef.current.on('dbltap', 'node', e => onNodeExpand(e.target.data('raw')));
    cyRef.current.on('tap', e => { if (e.target === cyRef.current) onNodeSelect(null); });

    return () => { cyRef.current?.destroy(); cyRef.current = null; };
  }, []); // eslint-disable-line

  // Update elements when data changes
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().remove();
    cy.add(toElements(nodes, edges));
    cy.layout(getLayout()).run();
  }, [nodes, edges]);

  // Highlight nodes from chat
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass('highlighted faded');
    if (!highlightedIds.length) return;
    const hl = cy.nodes().filter(n =>
      highlightedIds.some(h =>
        String(n.data('entityId')).includes(String(h)) ||
        String(h).includes(String(n.data('entityId')))
      )
    );
    if (hl.length) {
      hl.addClass('highlighted');
      hl.connectedEdges().addClass('highlighted');
      cy.nodes().not(hl).addClass('faded');
      cy.animate({ fit: { eles: hl, padding: 80 }, duration: 400 });
    }
  }, [highlightedIds]);

  const handleFit = useCallback(() => {
    cyRef.current?.fit(undefined, 40);
    cyRef.current?.elements().removeClass('highlighted faded selected');
  }, []);

  return (
    <div style={{ position:'relative', width:'100%', height:'100%' }}>
      <div ref={containerRef} style={{ width:'100%', height:'100%' }} />

      {/* Hint */}
      <div style={{ position:'absolute', top:14, left:14, fontSize:11, color:'#9ca3af', background:'rgba(255,255,255,0.92)', border:'1px solid #e8eaed', borderRadius:7, padding:'4px 10px', pointerEvents:'none' }}>
        Click to inspect · Double-click to expand
      </div>

      {/* Zoom controls */}
      <div style={{ position:'absolute', top:14, right:14, display:'flex', flexDirection:'column', gap:6 }}>
        {[['Minimize', handleFit], ['+', () => cyRef.current?.zoom({level: cyRef.current.zoom()*1.3, renderedPosition:{x: cyRef.current.width()/2, y: cyRef.current.height()/2}})], ['−', () => cyRef.current?.zoom({level: cyRef.current.zoom()*0.75, renderedPosition:{x: cyRef.current.width()/2, y: cyRef.current.height()/2}})]].map(([lbl, fn]) => (
          <button key={lbl} onClick={fn} style={{ padding:'4px 10px', height:30, background:'#fff', border:'1px solid #e8eaed', borderRadius:7, fontSize:12, color:'#374151', cursor:'pointer', boxShadow:'0 1px 3px rgba(0,0,0,0.06)', fontWeight:500, whiteSpace:'nowrap' }}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div style={{ position:'absolute', bottom:16, left:16, background:'rgba(255,255,255,0.96)', border:'1px solid #e8eaed', borderRadius:10, padding:'10px 16px', display:'flex', flexWrap:'wrap', gap:'7px 18px', maxWidth:420, boxShadow:'0 2px 10px rgba(0,0,0,0.07)' }}>
        {LEGEND.map(([type, label]) => (
          <div key={type} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'#6b7280' }}>
            <div style={{ width:9, height:9, borderRadius:'50%', background:COLORS[type], flexShrink:0 }} />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

function toElements(nodes, edges) {
  return [
    ...nodes.map(n => ({ data: { id: n.id, label: n.label, type: n.type, entityId: n.entityId, raw: n } })),
    ...edges.map(e => ({ data: { id: e.id, source: e.source, target: e.target, label: e.label } })),
  ];
}

function getCyStyle() {
  return [
    {
      selector: 'node',
      style: {
        'background-color': el => COLORS[el.data('type')] || '#94a3b8',
        'width': 10, 'height': 10,
        'border-width': 0,
        'label': '',
        'cursor': 'pointer',
        'transition-property': 'width, height, border-width',
        'transition-duration': '120ms',
      }
    },
    { selector: 'node[type="business_partner"]', style: { 'width': 16, 'height': 16 } },
    { selector: 'node[type="sales_order"]',      style: { 'width': 13, 'height': 13 } },
    { selector: 'node:hover',      style: { 'width': 16, 'height': 16, 'border-width': 2.5, 'border-color': '#ffffff' } },
    { selector: 'node.selected',   style: { 'width': 18, 'height': 18, 'border-width': 3, 'border-color': '#ffffff', 'z-index': 10 } },
    { selector: 'node.highlighted',style: { 'width': 20, 'height': 20, 'border-width': 3.5, 'border-color': '#facc15', 'z-index': 10 } },
    { selector: 'node.faded',      style: { 'opacity': 0.12 } },
    {
      selector: 'edge',
      style: {
        'width': 0.9,
        'line-color': '#bfdbfe',
        'target-arrow-color': '#bfdbfe',
        'target-arrow-shape': 'triangle',
        'arrow-scale': 0.5,
        'curve-style': 'bezier',
        'opacity': 0.7,
      }
    },
    { selector: 'edge.highlighted', style: { 'line-color': '#6366f1', 'target-arrow-color': '#6366f1', 'width': 2, 'opacity': 1 } },
    { selector: 'edge.faded',        style: { 'opacity': 0.04 } },
  ];
}

function getLayout() {
  return { name: 'cose', idealEdgeLength: 90, nodeRepulsion: 7000, animate: false, fit: true, padding: 40, randomize: false };
}
