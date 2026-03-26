import { useState, useEffect, useCallback } from 'react';
import GraphView from './components/GraphView.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import NodeInspector from './components/NodeInspector.jsx';
import StatsBar from './components/StatsBar.jsx';
import { fetchGraph, fetchStats, fetchNodeDetail, fetchNodeExpand } from './api.js';

export default function App() {
  const [graphData, setGraphData] = useState({ nodes: [], edges: [] });
  const [stats, setStats] = useState({});
  const [selectedNode, setSelectedNode] = useState(null);
  const [highlightedIds, setHighlightedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([fetchGraph(), fetchStats()])
      .then(([graph, s]) => { setGraphData(graph); setStats(s); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleNodeSelect = useCallback(async (node) => {
    if (!node) { setSelectedNode(null); return; }
    const detail = await fetchNodeDetail(node.type, node.entityId);
    setSelectedNode(detail);
  }, []);

  const handleNodeExpand = useCallback(async (node) => {
    const expanded = await fetchNodeExpand(node.type, node.entityId);
    setGraphData(prev => {
      const ids = new Set(prev.nodes.map(n => n.id));
      const eids = new Set(prev.edges.map(e => e.id));
      return {
        nodes: [...prev.nodes, ...expanded.nodes.filter(n => !ids.has(n.id))],
        edges: [...prev.edges, ...expanded.edges.filter(e => !eids.has(e.id))],
      };
    });
  }, []);

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:'#f7f8fa', overflow:'hidden' }}>
      {/* Header */}
      <header style={{
        height:52, padding:'0 24px', background:'#ffffff',
        borderBottom:'1px solid #e8eaed', display:'flex',
        alignItems:'center', gap:8, flexShrink:0,
        boxShadow:'0 1px 4px rgba(0,0,0,0.04)'
      }}>
        <span style={{ fontSize:13, color:'#9ca3af', fontWeight:400 }}>Mapping</span>
        <span style={{ color:'#d1d5db', fontSize:14 }}>/</span>
        <span style={{ fontSize:14, fontWeight:600, color:'#111827' }}>Order to Cash</span>
        <div style={{ marginLeft:'auto' }}><StatsBar stats={stats} /></div>
      </header>

      {/* Body */}
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        {/* Graph */}
        <div style={{ flex:1, position:'relative', overflow:'hidden', background:'#f7f8fa' }}>
          {loading && (
            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12 }}>
              <div style={{ width:32, height:32, border:'3px solid #e5e7eb', borderTopColor:'#6366f1', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
              <span style={{ fontSize:13, color:'#9ca3af' }}>Loading graph…</span>
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
          )}
          {error && (
            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:10, padding:'16px 24px', color:'#dc2626', fontSize:13 }}>
                ⚠ Backend error: {error}
              </div>
            </div>
          )}
          {!loading && !error && (
            <GraphView
              nodes={graphData.nodes}
              edges={graphData.edges}
              highlightedIds={highlightedIds}
              onNodeSelect={handleNodeSelect}
              onNodeExpand={handleNodeExpand}
            />
          )}
          {selectedNode && (
            <div style={{ position:'absolute', top:16, left:16, zIndex:20 }}>
              <NodeInspector node={selectedNode} onClose={() => setSelectedNode(null)} />
            </div>
          )}
        </div>

        {/* Chat sidebar */}
        <div style={{ width:360, flexShrink:0, background:'#ffffff', borderLeft:'1px solid #e8eaed', display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <ChatPanel onHighlight={setHighlightedIds} />
        </div>
      </div>
    </div>
  );
}
