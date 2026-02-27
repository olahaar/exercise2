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

const RULES = {
  limits: {
    tool: 60,
    prompt: 800,
    reflection: 2000
  },
  bannedTerms: ['plagiarize', 'cheat', 'impersonate']
};

let writeQueue = Promise.resolve();

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

function serializeWrite(task) {
  const runTask = async () => task();
  const next = writeQueue.then(runTask, runTask);
  writeQueue = next.then(() => undefined, () => undefined);
  return next;
}

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validateLogInput({ tool, prompt, reflection }, { requireTool = false, requirePrompt = false } = {}) {
  const errors = [];

  if (requireTool && !tool) errors.push('Tool name is required.');
  if (requirePrompt && !prompt) errors.push('Prompt is required.');

  if (tool && tool.length > RULES.limits.tool) {
    errors.push(`Tool name is too long (max ${RULES.limits.tool} characters).`);
  }
  if (prompt && prompt.length > RULES.limits.prompt) {
    errors.push(`Prompt is too long (max ${RULES.limits.prompt} characters).`);
  }
  if (reflection.length > RULES.limits.reflection) {
    errors.push(`Reflection is too long (max ${RULES.limits.reflection} characters).`);
  }

  return errors;
}

function evaluateCompliance(entry) {
  const reasons = [];
  const prompt = entry.prompt?.trim() || '';
  const tool = entry.tool?.trim() || '';
  const lowered = prompt.toLowerCase();
  if (!prompt) reasons.push('Prompt is required for auditability.');
  if (!tool) reasons.push('Tool name is required.');
  if (prompt.length > RULES.limits.prompt) reasons.push(`Prompt is too long; trim to under ${RULES.limits.prompt} characters.`);
  RULES.bannedTerms.forEach(word => {
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
    const cleanedTool = trimString(tool);
    const cleanedPrompt = trimString(prompt);
    const cleanedReflection = trimString(reflection);

    const errors = validateLogInput(
      { tool: cleanedTool, prompt: cleanedPrompt, reflection: cleanedReflection },
      { requireTool: true, requirePrompt: true }
    );

    if (errors.length) {
      return res.status(400).json({ error: errors[0] });
    }

    const entry = {
      id: randomUUID().slice(0, 8),
      tool: cleanedTool,
      prompt: cleanedPrompt,
      reflection: cleanedReflection,
      timestamp: new Date().toISOString()
    };
    const compliance = evaluateCompliance(entry);
    entry.compliance = compliance;

    await serializeWrite(async () => {
      const logs = await loadLogs();
      logs.unshift(entry);
      await saveLogs(logs);
    });

    res.status(201).json({ entry });
  } catch (err) {
    next(err);
  }
});

app.patch('/api/logs/:id/reflection', async (req, res, next) => {
  try {
    const { id } = req.params;
    const reflection = trimString(req.body?.reflection);
    const errors = validateLogInput({ tool: '', prompt: '', reflection });
    if (errors.length) {
      return res.status(400).json({ error: errors[0] });
    }

    const updated = await serializeWrite(async () => {
      const logs = await loadLogs();
      const idx = logs.findIndex(item => item.id === id);
      if (idx === -1) {
        return null;
      }

      logs[idx].reflection = reflection;
      logs[idx].compliance = evaluateCompliance(logs[idx]);
      await saveLogs(logs);
      return logs[idx];
    });

    if (!updated) {
      return res.status(404).json({ error: 'Log not found.' });
    }

    res.json({ entry: updated });
  } catch (err) {
    next(err);
  }
});

app.delete('/api/logs/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const removed = await serializeWrite(async () => {
      const logs = await loadLogs();
      const nextLogs = logs.filter(item => item.id !== id);
      if (nextLogs.length === logs.length) {
        return false;
      }
      await saveLogs(nextLogs);
      return true;
    });

    if (!removed) {
      return res.status(404).json({ error: 'Log not found.' });
    }

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
