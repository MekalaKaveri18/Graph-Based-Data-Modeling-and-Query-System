import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { getGraphData, getNodeDetail, expandNode } from './graphBuilder.js';
import { queryWithGemini } from './groqClient.js';
import { getDbStats } from './dataIngestion.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Allow all origins in production (Render frontend URL) or localhost in dev
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
}));
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/graph', async (req, res) => {
  try {
    const graph = await getGraphData();
    res.json(graph);
  } catch (err) {
    console.error('Graph error:', err);
    res.status(500).json({ error: 'Failed to load graph data', detail: err.message });
  }
});

app.get('/api/node/:type/:id', async (req, res) => {
  try {
    const { type, id } = req.params;
    const detail = await getNodeDetail(type, id);
    if (!detail) return res.status(404).json({ error: 'Node not found' });
    res.json(detail);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/node/:type/:id/expand', async (req, res) => {
  try {
    const { type, id } = req.params;
    const neighbours = await expandNode(type, id);
    res.json(neighbours);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const stats = await getDbStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required' });
    const result = await queryWithGemini(message.trim(), history);
    res.json(result);
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Failed to process query', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n✓ Server running on port ${PORT}`);
  console.log('  GET  /api/health');
  console.log('  GET  /api/graph');
  console.log('  GET  /api/stats');
  console.log('  POST /api/chat\n');
});
