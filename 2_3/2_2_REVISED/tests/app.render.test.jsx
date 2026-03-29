import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../src/hooks', () => ({
  useDashboardData: () => ({
    guidelines: ['Guideline A', 'Guideline B'],
    logs: [
      {
        id: 'log-1',
        tool: 'ChatGPT',
        timestamp: '2026-03-29T10:00:00.000Z',
        prompt: 'Summarize this text',
        reflection: 'Checked manually',
        compliance: { status: 'compliant', reasons: [] }
      }
    ],
    declaration: {
      total_logs: 1,
      compliant_logs: 1,
      needs_review_logs: 0,
      declaration_text: 'AI USE DECLARATION\n1. Tool: ChatGPT'
    },
    declUpdated: '10:30:00',
    busy: false,
    declBusy: false,
    error: 'Synthetic test error',
    refreshDeclaration: async () => {},
    createLog: async () => true,
    updateReflection: async () => {},
    deleteLog: async () => {}
  })
}));

import App from '../src/App';

describe('App render composition', () => {
  it('renders expected sections and surfaced error from hook state', () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain('AI Usage Logger');
    expect(html).toContain('Synthetic test error');
    expect(html).toContain('NTNU AI guidelines');
    expect(html).toContain('Guideline A');
    expect(html).toContain('Logged prompts');
    expect(html).toContain('Declaration');
  });
});
