import { useState, useRef, useEffect } from 'react';
import { sendChat } from '../api.js';

const SUGGESTIONS = [
  'Which products have the most billing documents?',
  'Trace the full flow of billing document 90504248',
  'Find sales orders delivered but not billed',
  'Which customers have the highest order value?',
  'Show orders with incomplete flows',
];

export default function ChatPanel({ onHighlight }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hi! I can help you analyze the Order to Cash process.' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  const send = async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setLoading(true);
    try {
      const history = messages.slice(-6).map(m => ({ role: m.role, content: m.content }));
      const result = await sendChat(msg, history);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: result.answer,
        sql: result.sql,
        guardrailed: result.guardrailed,
      }]);
      onHighlight(result.referenced_ids?.length ? result.referenced_ids : []);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      {/* Header */}
      <div style={{ padding:'16px 20px 14px', borderBottom:'1px solid #f0f2f5', flexShrink:0 }}>
        <div style={{ fontSize:14, fontWeight:600, color:'#111827' }}>Chat with Graph</div>
        <div style={{ fontSize:12, color:'#9ca3af', marginTop:2 }}>Order to Cash</div>
      </div>

      {/* Messages */}
      <div style={{ flex:1, overflowY:'auto', padding:'20px 20px 0' }}>
        {messages.map((msg, i) => <Bubble key={i} msg={msg} />)}
        {loading && (
          <div style={{ display:'flex', gap:10, marginBottom:16 }}>
            <AgentAvatar />
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12, fontWeight:600, color:'#111827', marginBottom:5 }}>Graph Agent</div>
              <div style={{ background:'#f3f4f6', borderRadius:'4px 12px 12px 12px', padding:'10px 14px', display:'inline-block' }}>
                <ThinkingDots />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} style={{ height:1 }} />
      </div>

      {/* Suggestions (only on first load) */}
      {messages.length <= 1 && !loading && (
        <div style={{ padding:'12px 20px', display:'flex', flexDirection:'column', gap:6, flexShrink:0 }}>
          {SUGGESTIONS.map((s, i) => (
            <button key={i} onClick={() => send(s)} style={{ background:'#f9fafb', border:'1px solid #e8eaed', borderRadius:8, color:'#374151', fontSize:12, padding:'8px 12px', textAlign:'left', cursor:'pointer', transition:'background 0.15s' }}
              onMouseEnter={e => e.target.style.background='#f0f4ff'}
              onMouseLeave={e => e.target.style.background='#f9fafb'}
            >{s}</button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div style={{ padding:'12px 20px', borderTop:'1px solid #f0f2f5', flexShrink:0 }}>
        <div style={{ display:'flex', gap:8, alignItems:'center', background:'#f9fafb', border:'1px solid #e8eaed', borderRadius:12, padding:'8px 8px 8px 14px' }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder="Analyze anything"
            disabled={loading}
            style={{ flex:1, border:'none', background:'transparent', outline:'none', fontSize:13, color:'#111827' }}
          />
          <button
            onClick={() => send()}
            disabled={loading || !input.trim()}
            style={{
              width:34, height:34, borderRadius:9, border:'none',
              background: input.trim() && !loading ? '#111827' : '#e5e7eb',
              color: input.trim() && !loading ? '#fff' : '#9ca3af',
              cursor: input.trim() && !loading ? 'pointer' : 'default',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:16, flexShrink:0, transition:'background 0.15s',
            }}
          >↑</button>
        </div>
      </div>

      {/* Status bar */}
      <div style={{ padding:'6px 20px 12px', display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
        <div style={{ width:7, height:7, borderRadius:'50%', background: loading ? '#f59e0b' : '#10b981', flexShrink:0 }} />
        <span style={{ fontSize:11, color:'#9ca3af' }}>{loading ? 'Graph Agent is thinking…' : 'Graph Agent is awaiting instructions'}</span>
      </div>
    </div>
  );
}

function AgentAvatar() {
  return (
    <div style={{ width:32, height:32, borderRadius:'50%', background:'#111827', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:1 }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="3" fill="#fff" opacity="0.9"/>
        <path d="M6 20c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" opacity="0.9"/>
      </svg>
    </div>
  );
}

function UserAvatar() {
  return (
    <div style={{ width:32, height:32, borderRadius:'50%', background:'#e8eaed', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:1 }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="3" fill="#6b7280" opacity="0.9"/>
        <path d="M6 20c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="#6b7280" strokeWidth="1.8" strokeLinecap="round" opacity="0.9"/>
      </svg>
    </div>
  );
}

function Bubble({ msg }) {
  const [showSql, setShowSql] = useState(false);
  const isUser = msg.role === 'user';

  return (
    <div style={{ display:'flex', gap:10, marginBottom:18, flexDirection: isUser ? 'row-reverse' : 'row' }}>
      {isUser ? <UserAvatar /> : <AgentAvatar />}
      <div style={{ maxWidth:'80%' }}>
        <div style={{ fontSize:12, fontWeight:600, color:'#111827', marginBottom:5, textAlign: isUser ? 'right' : 'left' }}>
          {isUser ? 'You' : 'Graph Agent'}
        </div>
        <div style={{
          background: isUser ? '#111827' : '#f3f4f6',
          color: isUser ? '#fff' : '#111827',
          borderRadius: isUser ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
          padding:'10px 14px', fontSize:13, lineHeight:1.65,
          whiteSpace:'pre-wrap', wordBreak:'break-word',
        }}>
          {msg.guardrailed && <div style={{ fontSize:11, color:'#f97316', fontWeight:600, marginBottom:5 }}>⚠ Off-topic — dataset queries only</div>}
          {msg.content}
        </div>
        {msg.sql && (
          <div style={{ marginTop:6 }}>
            <button onClick={() => setShowSql(v => !v)} style={{ background:'none', border:'none', color:'#9ca3af', fontSize:11, cursor:'pointer', padding:0, display:'flex', alignItems:'center', gap:3 }}>
              <span style={{ fontSize:10 }}>{showSql ? '▾' : '▸'}</span> View SQL query
            </button>
            {showSql && (
              <pre style={{ marginTop:6, background:'#f8fafc', border:'1px solid #e8eaed', borderRadius:8, padding:'10px 12px', fontSize:11, color:'#374151', overflowX:'auto', fontFamily:'ui-monospace, monospace', whiteSpace:'pre-wrap', lineHeight:1.5 }}>
                {msg.sql}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ThinkingDots() {
  return (
    <div style={{ display:'flex', gap:4, alignItems:'center' }}>
      {[0,1,2].map(i => (
        <div key={i} style={{ width:6, height:6, borderRadius:'50%', background:'#9ca3af', animation:'bounce 1.2s ease-in-out infinite', animationDelay: i*0.18+'s' }} />
      ))}
      <style>{`@keyframes bounce{0%,80%,100%{opacity:.25;transform:scale(0.8)}40%{opacity:1;transform:scale(1)}}`}</style>
    </div>
  );
}
