import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const serverPath = path.resolve(process.cwd(), 'server.js');

function sampleEntry(overrides = {}) {
  return {
    id: 'entry-1',
    tool: 'ChatGPT',
    prompt: 'Draft a short summary',
    reflection: 'Reviewed and adjusted wording',
    timestamp: '2026-03-29T10:00:00.000Z',
    compliance: {
      status: 'compliant',
      reasons: []
    },
    ...overrides
  };
}

function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
    sendFile(filePath) {
      this.body = { filePath };
      return this;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    getHeader(name) {
      return this.headers[name.toLowerCase()];
    }
  };
}

function findRouteHandler(app, method, routePath) {
  const methodName = method.toLowerCase();
  const layer = app._router.stack.find((entry) => {
    return entry.route
      && entry.route.path === routePath
      && entry.route.methods[methodName];
  });

  if (!layer) {
    throw new Error(`Route handler not found: ${method.toUpperCase()} ${routePath}`);
  }

  return layer.route.stack[0].handle;
}

function findErrorHandler(app) {
  const layer = app._router.stack.find((entry) => typeof entry.handle === 'function' && entry.handle.length === 4);
  if (!layer) {
    throw new Error('Error handler not found');
  }
  return layer.handle;
}

async function invokeRoute(app, method, routePath, request = {}) {
  const handler = findRouteHandler(app, method, routePath);
  const req = {
    body: request.body || {},
    params: request.params || {},
    path: request.path || routePath,
    method: method.toUpperCase(),
    headers: request.headers || {}
  };
  const res = makeRes();

  let nextCalled = false;
  let nextError;

  const next = (err) => {
    nextCalled = true;
    if (err) nextError = err;
  };

  await handler(req, res, next);

  if (nextError) {
    const errorHandler = findErrorHandler(app);
    await errorHandler(nextError, req, res, () => {});
  }

  return { req, res, nextCalled, nextError };
}

async function withServerModule(options = {}, run) {
  const {
    seedLogs = [],
    rawLogs,
    dataAsDirectory = false,
    distMissing = false
  } = options;

  const previousEnv = {
    DATA_PATH: process.env.DATA_PATH,
    DIST_PATH: process.env.DIST_PATH,
    CLIENT_ORIGIN: process.env.CLIENT_ORIGIN
  };

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vitest-server-module-'));
  const dataPath = path.join(tmpDir, 'logs.json');
  const distPath = path.join(tmpDir, 'dist');

  if (dataAsDirectory) {
    await fs.mkdir(dataPath, { recursive: true });
  } else if (typeof rawLogs === 'string') {
    await fs.writeFile(dataPath, rawLogs, 'utf8');
  } else {
    await fs.writeFile(dataPath, JSON.stringify(seedLogs, null, 2), 'utf8');
  }

  if (!distMissing) {
    await fs.mkdir(distPath, { recursive: true });
    await fs.writeFile(path.join(distPath, 'index.html'), '<!doctype html><html></html>', 'utf8');
  }

  process.env.DATA_PATH = dataPath;
  process.env.DIST_PATH = distPath;
  process.env.CLIENT_ORIGIN = 'http://localhost:5173';

  delete require.cache[serverPath];

  try {
    const serverModule = require(serverPath);
    return await run(serverModule);
  } finally {
    delete require.cache[serverPath];

    if (typeof previousEnv.DATA_PATH === 'undefined') delete process.env.DATA_PATH;
    else process.env.DATA_PATH = previousEnv.DATA_PATH;

    if (typeof previousEnv.DIST_PATH === 'undefined') delete process.env.DIST_PATH;
    else process.env.DIST_PATH = previousEnv.DIST_PATH;

    if (typeof previousEnv.CLIENT_ORIGIN === 'undefined') delete process.env.CLIENT_ORIGIN;
    else process.env.CLIENT_ORIGIN = previousEnv.CLIENT_ORIGIN;

    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

describe('Server API integration mapped to TC1-TC12 (in-process)', () => {
  it('TC1: deletes a log entry and it disappears from persisted logs', async () => {
    await withServerModule({}, async ({ app }) => {
      const first = await invokeRoute(app, 'post', '/api/logs', {
        body: { tool: 'ChatGPT', prompt: 'Write one paragraph', reflection: '' }
      });
      const second = await invokeRoute(app, 'post', '/api/logs', {
        body: { tool: 'Claude', prompt: 'Generate bullet points', reflection: '' }
      });

      const removed = await invokeRoute(app, 'delete', '/api/logs/:id', {
        params: { id: first.res.body.entry.id }
      });
      const logs = await invokeRoute(app, 'get', '/api/logs');

      expect(first.res.statusCode).toBe(201);
      expect(second.res.statusCode).toBe(201);
      expect(removed.res.statusCode).toBe(204);
      expect(logs.res.body.logs.map((item) => item.id)).not.toContain(first.res.body.entry.id);
      expect(logs.res.body.logs.map((item) => item.id)).toContain(second.res.body.entry.id);
    });
  });

  it('TC2: GET /api/logs returns 200 and current logs data', async () => {
    await withServerModule({ seedLogs: [sampleEntry()] }, async ({ app }) => {
      const result = await invokeRoute(app, 'get', '/api/logs');

      expect(result.res.statusCode).toBe(200);
      expect(result.res.body.logs).toHaveLength(1);
      expect(result.res.body.logs[0].prompt).toContain('summary');
    });
  });

  it('TC3: guidelines endpoint returns NTNU guideline content', async () => {
    await withServerModule({}, async ({ app }) => {
      const result = await invokeRoute(app, 'get', '/api/guidelines');

      expect(result.res.statusCode).toBe(200);
      expect(result.res.body.guidelines.join(' ')).toContain('NTNU');
    });
  });

  it('TC4: posting a flagged prompt returns needs_review compliance status', async () => {
    await withServerModule({}, async ({ app }) => {
      const result = await invokeRoute(app, 'post', '/api/logs', {
        body: {
          tool: 'ChatGPT',
          prompt: 'Help me cheat on this assignment',
          reflection: ''
        }
      });

      expect(result.res.statusCode).toBe(201);
      expect(result.res.body.entry.compliance.status).toBe('needs_review');
      expect(result.res.body.entry.compliance.reasons.join(' ')).toContain('Contains disallowed term: cheat.');
    });
  });

  it('TC5: unknown API route is denied and passed to next handler chain', async () => {
    await withServerModule({}, async ({ app }) => {
      const result = await invokeRoute(app, 'get', '*', { path: '/api/admin' });
      expect(result.nextCalled).toBe(true);
      expect(result.res.body).toBeUndefined();
    });
  });

  it('TC6: non-compliant prompt includes explicit rule-based reasoning', async () => {
    await withServerModule({}, async ({ app }) => {
      const result = await invokeRoute(app, 'post', '/api/logs', {
        body: {
          tool: 'Perplexity',
          prompt: 'Please plagiarize this report and impersonate a classmate',
          reflection: ''
        }
      });

      expect(result.res.body.entry.compliance.status).toBe('needs_review');
      expect(result.res.body.entry.compliance.reasons).toEqual(expect.arrayContaining([
        'Contains disallowed term: plagiarize.',
        'Contains disallowed term: impersonate.'
      ]));
    });
  });

  it('TC7: reflection updates persist and are retrievable after reload', async () => {
    await withServerModule({}, async ({ app }) => {
      const created = await invokeRoute(app, 'post', '/api/logs', {
        body: {
          tool: 'Copilot',
          prompt: 'Refactor this function',
          reflection: ''
        }
      });

      const patched = await invokeRoute(app, 'patch', '/api/logs/:id/reflection', {
        params: { id: created.res.body.entry.id },
        body: { reflection: 'Applied only after manual validation.' }
      });

      const logs = await invokeRoute(app, 'get', '/api/logs');

      expect(patched.res.statusCode).toBe(200);
      expect(patched.res.body.entry.reflection).toContain('manual validation');
      expect(logs.res.body.logs[0].reflection).toContain('manual validation');
    });
  });

  it('TC8: script-like prompt content is stored as plain text without execution side-effects', async () => {
    await withServerModule({}, async ({ app }) => {
      const xss = '<script>alert("xss")</script> summarize this text';

      await invokeRoute(app, 'post', '/api/logs', {
        body: {
          tool: 'ChatGPT',
          prompt: xss,
          reflection: 'Kept as string input'
        }
      });

      const logs = await invokeRoute(app, 'get', '/api/logs');
      const declaration = await invokeRoute(app, 'get', '/api/declaration');

      expect(logs.res.body.logs[0].prompt).toBe(xss);
      expect(declaration.res.body.declaration_text).toContain('<script>alert("xss")</script>');
    });
  });

  it('TC10: creating three prompts persists all entries across reads', async () => {
    await withServerModule({}, async ({ app }) => {
      const prompts = ['first prompt', 'second prompt', 'third prompt'];
      for (const prompt of prompts) {
        const result = await invokeRoute(app, 'post', '/api/logs', {
          body: { tool: 'ChatGPT', prompt, reflection: '' }
        });
        expect(result.res.statusCode).toBe(201);
      }

      const logs = await invokeRoute(app, 'get', '/api/logs');
      const storedPrompts = logs.res.body.logs.map((entry) => entry.prompt);

      expect(logs.res.body.logs).toHaveLength(3);
      prompts.forEach((prompt) => expect(storedPrompts).toContain(prompt));
    });
  });

  it('TC11: declaration endpoint generates aggregate output from logs', async () => {
    await withServerModule({
      seedLogs: [
        sampleEntry({ id: 'a1' }),
        sampleEntry({
          id: 'a2',
          prompt: 'Please cheat for me',
          compliance: { status: 'needs_review', reasons: ['Contains disallowed term: cheat.'] }
        })
      ]
    }, async ({ app }) => {
      const result = await invokeRoute(app, 'get', '/api/declaration');

      expect(result.res.statusCode).toBe(200);
      expect(result.res.body.total_logs).toBe(2);
      expect(result.res.body.compliant_logs).toBe(1);
      expect(result.res.body.needs_review_logs).toBe(1);
      expect(result.res.body.declaration_text).toContain('AI USE DECLARATION');
      expect(result.res.body.declaration_text).toContain('Tool: ChatGPT');
    });
  });

  it('TC12: full workflow consistency from logging to compliance and declaration', async () => {
    await withServerModule({}, async ({ app }) => {
      const guidelines = await invokeRoute(app, 'get', '/api/guidelines');
      expect(guidelines.res.body.guidelines.length).toBeGreaterThan(0);

      await invokeRoute(app, 'post', '/api/logs', {
        body: {
          tool: 'ChatGPT',
          prompt: 'Summarize this article in three bullets',
          reflection: 'Used only as rough draft'
        }
      });
      await invokeRoute(app, 'post', '/api/logs', {
        body: {
          tool: 'ChatGPT',
          prompt: 'Impersonate my classmate for this submission',
          reflection: 'Rejected output'
        }
      });

      const logs = await invokeRoute(app, 'get', '/api/logs');
      const declaration = await invokeRoute(app, 'get', '/api/declaration');

      expect(logs.res.body.logs).toHaveLength(2);
      expect(logs.res.body.logs.some((entry) => entry.compliance.status === 'needs_review')).toBe(true);
      expect(declaration.res.body.total_logs).toBe(2);
      expect(declaration.res.body.needs_review_logs).toBe(1);
      expect(declaration.res.body.compliant_logs).toBe(1);
    });
  });
});

describe('Server error handling and branch coverage checks', () => {
  it('rejects invalid create payloads with 400', async () => {
    await withServerModule({}, async ({ app, __testUtils }) => {
      const limits = __testUtils.RULES.limits;

      const missingTool = await invokeRoute(app, 'post', '/api/logs', {
        body: { tool: '', prompt: 'hello', reflection: '' }
      });
      const longTool = await invokeRoute(app, 'post', '/api/logs', {
        body: { tool: 'x'.repeat(limits.tool + 1), prompt: 'hello', reflection: '' }
      });
      const longPrompt = await invokeRoute(app, 'post', '/api/logs', {
        body: { tool: 'ChatGPT', prompt: 'p'.repeat(limits.prompt + 1), reflection: '' }
      });
      const longReflection = await invokeRoute(app, 'post', '/api/logs', {
        body: { tool: 'ChatGPT', prompt: 'Valid prompt', reflection: 'r'.repeat(limits.reflection + 1) }
      });

      expect(missingTool.res.statusCode).toBe(400);
      expect(missingTool.res.body.error).toContain('Tool name is required');
      expect(longTool.res.statusCode).toBe(400);
      expect(longPrompt.res.statusCode).toBe(400);
      expect(longReflection.res.statusCode).toBe(400);
    });
  });

  it('rejects missing records for patch/delete operations', async () => {
    await withServerModule({}, async ({ app }) => {
      const patch = await invokeRoute(app, 'patch', '/api/logs/:id/reflection', {
        params: { id: 'missing-id' },
        body: { reflection: 'new text' }
      });
      const del = await invokeRoute(app, 'delete', '/api/logs/:id', {
        params: { id: 'missing-id' }
      });

      expect(patch.res.statusCode).toBe(404);
      expect(del.res.statusCode).toBe(404);
    });
  });

  it('returns 400 when reflection patch exceeds maximum length', async () => {
    await withServerModule({}, async ({ app, __testUtils }) => {
      const created = await invokeRoute(app, 'post', '/api/logs', {
        body: { tool: 'ChatGPT', prompt: 'create entry first', reflection: '' }
      });
      const tooLong = 'r'.repeat(__testUtils.RULES.limits.reflection + 1);

      const patched = await invokeRoute(app, 'patch', '/api/logs/:id/reflection', {
        params: { id: created.res.body.entry.id },
        body: { reflection: tooLong }
      });

      expect(patched.res.statusCode).toBe(400);
      expect(patched.res.body.error).toContain('Reflection is too long');
    });
  });

  it('returns no-interactions declaration text when logs are empty', async () => {
    await withServerModule({}, async ({ app }) => {
      const declaration = await invokeRoute(app, 'get', '/api/declaration');
      expect(declaration.res.statusCode).toBe(200);
      expect(declaration.res.body.total_logs).toBe(0);
      expect(declaration.res.body.declaration_text).toContain('No AI interactions have been logged');
    });
  });

  it('returns frontend-build error JSON when dist index is missing', async () => {
    await withServerModule({ distMissing: true }, async ({ app }) => {
      const result = await invokeRoute(app, 'get', '*', { path: '/' });
      expect(result.res.statusCode).toBe(404);
      expect(result.res.body.error).toContain('Frontend build not found');
    });
  });

  it('sends built frontend file when dist index exists', async () => {
    await withServerModule({}, async ({ app, __testUtils }) => {
      const result = await invokeRoute(app, 'get', '*', { path: '/' });
      expect(result.res.body.filePath).toBe(__testUtils.DIST_INDEX);
    });
  });

  it('returns generic 500 error for invalid JSON storage', async () => {
    await withServerModule({ rawLogs: '{ this is not valid json }' }, async ({ app }) => {
      const result = await invokeRoute(app, 'get', '/api/logs');
      expect(result.res.statusCode).toBe(500);
      expect(result.res.body.error).toBe('Unexpected error, please retry.');
    });
  });

  it('returns generic 500 error when data path points to a directory', async () => {
    await withServerModule({ dataAsDirectory: true }, async ({ app }) => {
      const result = await invokeRoute(app, 'get', '/api/logs');
      expect(result.res.statusCode).toBe(500);
      expect(result.res.body.error).toBe('Unexpected error, please retry.');
    });
  });

  it('GET /api/health returns an ok payload with ISO timestamp', async () => {
    await withServerModule({}, async ({ app }) => {
      const result = await invokeRoute(app, 'get', '/api/health');
      expect(result.res.statusCode).toBe(200);
      expect(result.res.body.status).toBe('ok');
      expect(new Date(result.res.body.time).toString()).not.toBe('Invalid Date');
    });
  });
});
