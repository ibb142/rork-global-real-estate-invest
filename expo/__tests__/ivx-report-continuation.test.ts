import {
  detectTruncatedResponse,
  extractItemNumbers,
  extractLastItemNumber,
  extractReportTitle,
  splitReportIntoParts,
  buildReportParts,
  buildContinuationPrompt,
  isContinuationRequest,
  detectReportPattern,
  buildContinuationState,
  buildContinuationPartMessage,
  buildContinuationUserPrompt,
  REPORT_CONTINUATION_MAX_CHARS_PER_PART,
} from '../../backend/services/ivx-report-continuation';

describe('IVX Report Continuation', () => {
  describe('detectTruncatedResponse', () => {
    it('returns false for a short complete response', () => {
      expect(detectTruncatedResponse('Here is a short answer.', 3000)).toBe(false);
    });

    it('returns true when response ends with "..."', () => {
      expect(detectTruncatedResponse('This report continues...', 3000)).toBe(true);
    });

    it('returns true for explicit continuation markers', () => {
      expect(detectTruncatedResponse('Part 1 of the report. (continued)', 3000)).toBe(true);
      expect(detectTruncatedResponse('More items follow in the next message.', 3000)).toBe(false);
    });

    it('returns true for a very long response ending abruptly', () => {
      const longText = 'A'.repeat(45000);
      expect(detectTruncatedResponse(longText, 12000)).toBe(true);
    });

    it('returns false for a very long response ending with a period', () => {
      const longText = 'A'.repeat(10000) + '.';
      expect(detectTruncatedResponse(longText, 12000)).toBe(false);
    });

    it('returns true for an incomplete last numbered item', () => {
      const lines: string[] = [];
      for (let i = 1; i <= 500; i++) {
        lines.push(`${i}. This is a longer item description to make the overall text large enough to trigger the heuristic truncation check in the continuation engine.`);
      }
      lines.push('501. This item starts but does not fini');
      const text = lines.join('\n');
      expect(detectTruncatedResponse(text, 12000)).toBe(true);
    });
  });

  describe('extractItemNumbers', () => {
    it('extracts numbered items from a report', () => {
      const text = [
        '1. First item',
        '2. Second item',
        '10. Tenth item',
        '- 11. Eleventh item',
      ].join('\n');
      expect(extractItemNumbers(text)).toEqual([1, 2, 10, 11]);
    });

    it('returns empty array for text without numbered items', () => {
      expect(extractItemNumbers('No items here.')).toEqual([]);
    });
  });

  describe('extractLastItemNumber', () => {
    it('returns the highest item number', () => {
      const text = '1. First\n2. Second\n5. Fifth';
      expect(extractLastItemNumber(text)).toBe(5);
    });

    it('returns 0 when no items exist', () => {
      expect(extractLastItemNumber('No items')).toBe(0);
    });
  });

  describe('extractReportTitle', () => {
    it('extracts the title from the first non-item line', () => {
      const text = 'IVX AI Capability Report\n1. First item';
      expect(extractReportTitle(text)).toBe('IVX AI Capability Report');
    });

    it('returns null when there is no clear title', () => {
      const text = '1. First item\n2. Second item';
      expect(extractReportTitle(text)).toBeNull();
    });
  });

  describe('splitReportIntoParts', () => {
    it('returns a single part when text is short', () => {
      const text = 'Short report.';
      const parts = splitReportIntoParts(text, 1000);
      expect(parts).toHaveLength(1);
      expect(parts[0]).toBe(text);
    });

    it('splits a long report into multiple parts at natural boundaries', () => {
      const lines: string[] = [];
      for (let i = 1; i <= 50; i++) {
        lines.push(`${i}. This is item number ${i} with some description text that makes it longer.`);
      }
      const text = lines.join('\n');
      const parts = splitReportIntoParts(text, 1000);
      expect(parts.length).toBeGreaterThan(1);
      // Each part should be within the limit (with some tolerance for break-point search)
      for (const part of parts) {
        expect(part.length).toBeLessThanOrEqual(1500);
      }
    });

    it('preserves all content across parts', () => {
      const text = '1. First\n2. Second\n3. Third';
      const parts = splitReportIntoParts(text, 20);
      const combined = parts.join('\n\n');
      // Combined should contain all original items (may have extra whitespace)
      expect(combined).toContain('1. First');
      expect(combined).toContain('2. Second');
      expect(combined).toContain('3. Third');
    });
  });

  describe('buildReportParts', () => {
    it('assigns part numbers and item ranges', () => {
      const text = '1. First\n2. Second\n3. Third';
      const parts = buildReportParts(text, 20);
      expect(parts.length).toBeGreaterThan(0);
      expect(parts[0].partNumber).toBe(1);
      expect(parts[0].itemRange).not.toBeNull();
    });
  });

  describe('buildContinuationPrompt', () => {
    it('includes the original prompt and last item number', () => {
      const prompt = buildContinuationPrompt('Audit my app', 'partial text', 5);
      expect(prompt).toContain('Audit my app');
      expect(prompt).toContain('item 5');
      expect(prompt).toContain('Do NOT repeat items 1 through 5');
      expect(prompt).toContain('Start with item 6');
    });
  });

  describe('isContinuationRequest', () => {
    it('matches exact continue prompts', () => {
      expect(isContinuationRequest('CONTINUE')).toBe(true);
      expect(isContinuationRequest('continue')).toBe(true);
      expect(isContinuationRequest('Next part')).toBe(true);
      expect(isContinuationRequest('Resume from item 10')).toBe(true);
    });

    it('does not match normal chat messages', () => {
      expect(isContinuationRequest('How are you?')).toBe(false);
      expect(isContinuationRequest('Tell me more')).toBe(false);
    });
  });

  describe('detectReportPattern', () => {
    it('returns true for a report with many numbered items', () => {
      const lines = Array.from({ length: 10 }, (_, i) => `${i + 1}. Item ${i + 1}`);
      expect(detectReportPattern(lines.join('\n'))).toBe(true);
    });

    it('returns false for a short text without numbered items', () => {
      expect(detectReportPattern('Hello, how can I help?')).toBe(false);
    });
  });

  describe('buildContinuationState', () => {
    it('builds state with correct initial index', () => {
      const parts = buildReportParts('1. A\n2. B', 100);
      const state = buildContinuationState('token-123', 'conv-1', 'Audit report', 'My Report', parts);
      expect(state.token).toBe('token-123');
      expect(state.conversationId).toBe('conv-1');
      expect(state.originalPrompt).toBe('Audit report');
      expect(state.reportTitle).toBe('My Report');
      expect(state.currentPartIndex).toBe(0);
      expect(state.parts.length).toBe(parts.length);
    });
  });

  describe('buildContinuationPartMessage', () => {
    it('formats a continuation part message', () => {
      expect(buildContinuationPartMessage(1, 3, 5, false)).toContain('Part 1 of 3 complete');
      expect(buildContinuationPartMessage(3, 3, null, true)).toContain('report complete');
    });
  });

  describe('buildContinuationUserPrompt', () => {
    it('formats a manual resume prompt', () => {
      expect(buildContinuationUserPrompt(5)).toBe('Reply CONTINUE to resume from item 5.');
      expect(buildContinuationUserPrompt(null)).toBe('Reply CONTINUE to resume the report.');
    });
  });

  describe('300-item report splitting', () => {
    it('splits a 300-item report into manageable parts', () => {
      const items: string[] = [];
      for (let i = 1; i <= 300; i++) {
        items.push(`${i}. This is capability item ${i} with a detailed description of what it does and how it works for the IVX AI system.`);
      }
      const report = 'IVX AI Capability Report - 300 Items\n\n' + items.join('\n');
      const parts = splitReportIntoParts(report, REPORT_CONTINUATION_MAX_CHARS_PER_PART);

      expect(parts.length).toBeGreaterThan(1);
      // Verify total items are preserved
      const allItemNumbers = extractItemNumbers(parts.join('\n'));
      expect(allItemNumbers.length).toBe(300);
      expect(Math.max(...allItemNumbers)).toBe(300);

      // Each part should be within reasonable size
      for (const part of parts) {
        expect(part.length).toBeLessThanOrEqual(REPORT_CONTINUATION_MAX_CHARS_PER_PART + 500);
      }
    });
  });
});
