import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const serverPath = path.resolve(process.cwd(), 'server.js');
const { __testUtils } = require(serverPath);

async function withIsolatedServerModule(options = {}, run) {
  const { rawLogs, createFile = true } = options;
  const previousDataPath = process.env.DATA_PATH;
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vitest-server-utils-'));
  const dataPath = path.join(tmpDir, 'logs.json');

  if (createFile) {
    await fs.writeFile(dataPath, rawLogs ?? '[]', 'utf8');
  }

  process.env.DATA_PATH = dataPath;
  delete require.cache[serverPath];

  try {
    const serverModule = require(serverPath);
    return await run(serverModule.__testUtils);
  } finally {
    delete require.cache[serverPath];
    if (typeof previousDataPath === 'undefined') {
      delete process.env.DATA_PATH;
    } else {
      process.env.DATA_PATH = previousDataPath;
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

describe('Server utility functions', () => {
  it('trimString trims normal strings and sanitizes non-strings', () => {
    expect(__testUtils.trimString('  hello  ')).toBe('hello');
    expect(__testUtils.trimString('')).toBe('');
    expect(__testUtils.trimString(null)).toBe('');
    expect(__testUtils.trimString(undefined)).toBe('');
    expect(__testUtils.trimString(42)).toBe('');
  });

  it('validateLogInput enforces required fields and length limits', () => {
    const limits = __testUtils.RULES.limits;

    const requiredErrors = __testUtils.validateLogInput(
      { tool: '', prompt: '', reflection: '' },
      { requireTool: true, requirePrompt: true }
    );
    expect(requiredErrors).toEqual(expect.arrayContaining([
      'Tool name is required.',
      'Prompt is required.'
    ]));

    const lengthErrors = __testUtils.validateLogInput({
      tool: 'x'.repeat(limits.tool + 1),
      prompt: 'p'.repeat(limits.prompt + 1),
      reflection: 'r'.repeat(limits.reflection + 1)
    });

    expect(lengthErrors).toHaveLength(3);
    expect(lengthErrors[0]).toContain('Tool name is too long');
    expect(lengthErrors[1]).toContain('Prompt is too long');
    expect(lengthErrors[2]).toContain('Reflection is too long');
  });

  it('evaluateCompliance marks compliant and needs_review entries correctly', () => {
    const compliant = __testUtils.evaluateCompliance({
      tool: 'ChatGPT',
      prompt: 'Summarize this paragraph'
    });

    expect(compliant).toEqual({ status: 'compliant', reasons: [] });

    const flagged = __testUtils.evaluateCompliance({
      tool: '',
      prompt: 'Please cheat and plagiarize this report'
    });

    expect(flagged.status).toBe('needs_review');
    expect(flagged.reasons).toEqual(expect.arrayContaining([
      'Tool name is required.',
      'Contains disallowed term: cheat.',
      'Contains disallowed term: plagiarize.'
    ]));
  });

  it('buildDeclarationText handles both empty and populated logs', () => {
    const emptyText = __testUtils.buildDeclarationText([]);
    expect(emptyText).toContain('No AI interactions have been logged');

    const fullText = __testUtils.buildDeclarationText([
      {
        tool: 'ChatGPT',
        prompt: 'Write tests for API module',
        reflection: 'Used output as draft only',
        timestamp: '2026-03-29T10:00:00.000Z',
        compliance: {
          status: 'needs_review',
          reasons: ['Contains disallowed term: impersonate.']
        }
      }
    ]);

    expect(fullText).toContain('AI USE DECLARATION');
    expect(fullText).toContain('Tool: ChatGPT');
    expect(fullText).toContain('needs review');
    expect(fullText).toContain('Contains disallowed term: impersonate.');
  });

  it('serializeWrite executes tasks in order and keeps queue alive after rejection', async () => {
    const order = [];

    const first = __testUtils.serializeWrite(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push('first');
      return 'a';
    });

    const second = __testUtils.serializeWrite(async () => {
      order.push('second');
      return 'b';
    });

    await expect(first).resolves.toBe('a');
    await expect(second).resolves.toBe('b');
    expect(order).toEqual(['first', 'second']);

    const fails = __testUtils.serializeWrite(async () => {
      throw new Error('queue failure');
    });
    await expect(fails).rejects.toThrow('queue failure');

    const afterFailure = __testUtils.serializeWrite(async () => 'still works');
    await expect(afterFailure).resolves.toBe('still works');
  });

  it('loadLogs returns [] when the persisted payload is not an array', async () => {
    await withIsolatedServerModule({ rawLogs: '{"unexpected":"shape"}' }, async (isolatedUtils) => {
      const logs = await isolatedUtils.loadLogs();
      expect(logs).toEqual([]);
    });
  });

  it('loadLogs returns [] when the data file is missing (ENOENT branch)', async () => {
    await withIsolatedServerModule({ createFile: false }, async (isolatedUtils) => {
      const logs = await isolatedUtils.loadLogs();
      expect(logs).toEqual([]);
    });
  });
});
