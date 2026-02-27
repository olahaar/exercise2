const fs = require('fs/promises');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { randomUUID } = require('crypto');

const app = express();
const PORT = process.env.PORT || 4000;
const HOST = '127.0.0.1';
const DATA_PATH = path.join(__dirname, 'data', 'logs.json');
const ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(cors({
  origin: ORIGIN,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json({ limit: '200kb' }));

const guidelines = [
  'Follow NTNU AI usage guidelines; cite AI assistance clearly.',
  'Do not include sensitive personal data in prompts or logs.',
  'Document the intent of each AI interaction and keep prompts reproducible.',
  'Reflection fields should capture what changed because of the AI output.',
  'Ensure any borrowed text or code is reviewed and validated manually.'
];

async function loadLogs() {
  try {
    const raw = await fs.readFile(DATA_PATH, 'utf8');
    const parsed = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function saveLogs(logs) {
  await fs.writeFile(DATA_PATH, JSON.stringify(logs, null, 2));
}

function evaluateCompliance(entry) {
  const reasons = [];
  const prompt = entry.prompt?.trim() || '';
  const tool = entry.tool?.trim() || '';
  const lowered = prompt.toLowerCase();
  const banned = ['plagiarize', 'cheat', 'impersonate'];
  if (!prompt) reasons.push('Prompt is required for auditability.');
  if (!tool) reasons.push('Tool name is required.');
  if (prompt.length > 800) reasons.push('Prompt is too long; trim to under 800 characters.');
  banned.forEach(word => {
    if (lowered.includes(word)) reasons.push(`Contains disallowed term: ${word}.`);
  });
  const status = reasons.length ? 'needs_review' : 'compliant';
  return { status, reasons };
}

function buildDeclarationText(logs) {
  if (!logs.length) {
    return [
      'AI USE DECLARATION',
      '',
      'No AI interactions have been logged for this assignment.'
    ].join('\n');
  }

  const entries = logs.map((entry, index) => {
    const status = entry.compliance?.status === 'compliant' ? 'compliant' : 'needs review';
    const reasons = entry.compliance?.reasons?.length
      ? ` (${entry.compliance.reasons.join('; ')})`
      : '';

    return [
      `${index + 1}. Tool: ${entry.tool || 'Unknown tool'}`,
      `   Timestamp: ${entry.timestamp || 'Unknown timestamp'}`,
      `   Prompt: ${entry.prompt || 'No prompt recorded'}`,
      `   Reflection: ${entry.reflection || 'No reflection provided'}`,
      `   Compliance: ${status}${reasons}`
    ].join('\n');
  }).join('\n\n');

  return [
    'AI USE DECLARATION',
    '',
    `Total logged interactions: ${logs.length}`,
    '',
    'The following AI use was logged during work on this assignment:',
    '',
    entries
  ].join('\n');
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/api/guidelines', (_req, res) => {
  res.json({ guidelines });
});

app.get('/api/logs', async (_req, res, next) => {
  try {
    const logs = await loadLogs();
    res.json({ logs });
  } catch (err) {
    next(err);
  }
});

app.post('/api/logs', async (req, res, next) => {
  try {
    const { tool, prompt, reflection } = req.body || {};
    const timestamp = req.body?.timestamp || new Date().toISOString();

    const cleanedTool = (tool || '').trim();
    const cleanedPrompt = (prompt || '').trim();
    const cleanedReflection = (reflection || '').trim();

    if (!cleanedTool) {
      return res.status(400).json({ error: 'Tool name is required.' });
    }
    if (!cleanedPrompt) {
      return res.status(400).json({ error: 'Prompt is required.' });
    }
    if (cleanedTool.length > 60) {
      return res.status(400).json({ error: 'Tool name is too long (max 60 characters).' });
    }
    if (cleanedPrompt.length > 800) {
      return res.status(400).json({ error: 'Prompt is too long (max 800 characters).' });
    }
    if (cleanedReflection.length > 2000) {
      return res.status(400).json({ error: 'Reflection is too long (max 2000 characters).' });
    }
    const entry = {
      id: randomUUID().slice(0, 8),
      tool: cleanedTool,
      prompt: cleanedPrompt,
      reflection: cleanedReflection,
      timestamp
    };
    const compliance = evaluateCompliance(entry);
    entry.compliance = compliance;
    const logs = await loadLogs();
    logs.unshift(entry);
    await saveLogs(logs);
    res.status(201).json({ entry });
  } catch (err) {
    next(err);
  }
});

app.patch('/api/logs/:id/reflection', async (req, res, next) => {
  try {
    const { id } = req.params;
    const reflection = (req.body?.reflection || '').trim();
    if (!reflection) {
      return res.status(400).json({ error: 'Reflection text is required.' });
    }
    const logs = await loadLogs();
    const idx = logs.findIndex(item => item.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Log not found.' });
    }
    logs[idx].reflection = reflection;
    logs[idx].compliance = evaluateCompliance(logs[idx]);
    await saveLogs(logs);
    res.json({ entry: logs[idx] });
  } catch (err) {
    next(err);
  }
});

app.delete('/api/logs/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const logs = await loadLogs();
    const nextLogs = logs.filter(item => item.id !== id);
    if (nextLogs.length === logs.length) {
      return res.status(404).json({ error: 'Log not found.' });
    }
    await saveLogs(nextLogs);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

app.get('/api/declaration', async (_req, res, next) => {
  try {
    const logs = await loadLogs();
    const compliant = logs.filter(l => l.compliance?.status === 'compliant').length;
    const flagged = logs.length - compliant;
    const summary = {
      total_logs: logs.length,
      compliant_logs: compliant,
      needs_review_logs: flagged,
      guidelines,
      declaration_text: buildDeclarationText(logs)
    };
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

app.use(express.static(path.join(__dirname, 'public')));

app.use((err, _req, res, _next) => {
  // Avoid leaking internal errors
  console.error('[error]', err.message);
  res.status(500).json({ error: 'Unexpected error, please retry.' });
});

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
