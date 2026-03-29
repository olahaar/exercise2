import fs from 'fs/promises';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  DeclarationPanel,
  GuidelinesPanel,
  LogList,
  StatusPill
} from '../src/components';

describe('Component render checks for guideline/compliance/reflection UI', () => {
  it('TC3: GuidelinesPanel renders NTNU guidelines list content', () => {
    const html = renderToStaticMarkup(
      <GuidelinesPanel
        guidelines={[
          'Follow NTNU AI usage guidelines',
          'Document intent for each prompt'
        ]}
      />
    );

    expect(html).toContain('NTNU AI guidelines');
    expect(html).toContain('Follow NTNU AI usage guidelines');
    expect(html).toContain('Document intent for each prompt');
  });

  it('StatusPill renders compliant and needs-review variants', () => {
    const compliantHtml = renderToStaticMarkup(
      <StatusPill compliance={{ status: 'compliant', reasons: [] }} />
    );
    const flaggedHtml = renderToStaticMarkup(
      <StatusPill compliance={{ status: 'needs_review', reasons: ['reason'] }} />
    );

    expect(compliantHtml).toContain('pill ok');
    expect(compliantHtml).toContain('Compliant');
    expect(flaggedHtml).toContain('pill warn');
    expect(flaggedHtml).toContain('Needs review');

    const empty = renderToStaticMarkup(<StatusPill compliance={null} />);
    expect(empty).toBe('');
  });

  it('LogList renders empty and populated states, including reflection section', () => {
    const emptyHtml = renderToStaticMarkup(
      <LogList logs={[]} onReflection={async () => {}} onDelete={async () => {}} />
    );
    expect(emptyHtml).toContain('Nothing logged yet.');

    const populatedHtml = renderToStaticMarkup(
      <LogList
        logs={[
          {
            id: 'log-1',
            tool: 'ChatGPT',
            timestamp: '2026-03-29T10:00:00.000Z',
            prompt: 'Explain branch coverage',
            reflection: 'Used as baseline only',
            compliance: {
              status: 'needs_review',
              reasons: ['Contains disallowed term: cheat.']
            }
          }
        ]}
        onReflection={async () => {}}
        onDelete={async () => {}}
      />
    );

    expect(populatedHtml).toContain('Why flagged:');
    expect(populatedHtml).toContain('Delete');
    expect(populatedHtml).toContain('class="reflection"');
  });

  it('DeclarationPanel renders fallback and summary states', () => {
    const noDataHtml = renderToStaticMarkup(
      <DeclarationPanel
        declaration={null}
        declBusy={false}
        declUpdated=""
        onRefresh={() => {}}
      />
    );

    expect(noDataHtml).toContain('No declaration yet.');

    const withDataHtml = renderToStaticMarkup(
      <DeclarationPanel
        declaration={{
          total_logs: 2,
          compliant_logs: 1,
          needs_review_logs: 1,
          declaration_text: 'AI USE DECLARATION\n1. Tool: ChatGPT'
        }}
        declBusy={true}
        declUpdated="11:31:00"
        onRefresh={() => {}}
      />
    );

    expect(withDataHtml).toContain('AI USE DECLARATION');
    expect(withDataHtml).toContain('Total logs: 2 - Compliant: 1 - Needs review: 1');
    expect(withDataHtml).toContain('Updated: 11:31:00');
    expect(withDataHtml).toContain('Refreshing...');
  });

  it('TC9: reflection style class is visually distinct in CSS', async () => {
    const cssPath = path.resolve(process.cwd(), 'src/styles.css');
    const css = await fs.readFile(cssPath, 'utf8');

    expect(css).toContain('.reflection');
    expect(css).toContain('background: var(--reflection-bg)');
    expect(css).toContain('border: 1px dashed #f2c26b');
  });
});
