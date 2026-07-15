import { describe, expect, test } from 'bun:test';
import {
  createIVXOwnerMultiFileUnderstandingPrompt,
  type IVXOwnerFileInsight,
} from '@/src/modules/ivx-owner-ai/services/ivxOwnerMemoryService';

function makeInsight(index: number, mime: string, extras?: Partial<IVXOwnerFileInsight>): IVXOwnerFileInsight {
  return {
    id: `file-${index}`,
    name: `screenshot-${index}.png`,
    mimeType: mime,
    size: 1024 * (index + 1),
    summary: `Screenshot ${index} captured locally`,
    excerpt: null,
    uploadedAt: new Date().toISOString(),
    ...extras,
  };
}

describe('createIVXOwnerMultiFileUnderstandingPrompt', () => {
  test('builds a prompt that confirms exact count for 20 images', () => {
    const files = Array.from({ length: 20 }).map((_, i) => makeInsight(i, 'image/png'));
    const prompt = createIVXOwnerMultiFileUnderstandingPrompt({ files, caption: 'Analyze all 20 images and tell me what is broken.' });

    expect(prompt).toContain('20 files');
    expect(prompt).toContain('20 images');
    expect(prompt).toContain('"Received 20 files (20 images).');
    expect(prompt).toContain('Owner caption: Analyze all 20 images and tell me what is broken.');
    expect(prompt).toContain('Analyze EVERY item below individually');
    expect(prompt).toContain('Summary of issues found');
    expect(prompt).toContain('Next steps');
    for (let i = 1; i <= 20; i += 1) {
      expect(prompt).toContain(`${i}. screenshot-${i - 1}.png`);
    }
  });

  test('handles mixed images and videos', () => {
    const files = [
      makeInsight(0, 'image/jpeg'),
      makeInsight(1, 'image/png'),
      makeInsight(2, 'video/mp4', { name: 'demo.mp4' }),
    ];
    const prompt = createIVXOwnerMultiFileUnderstandingPrompt({ files });
    expect(prompt).toContain('3 files');
    expect(prompt).toContain('2 images, 1 video');
    expect(prompt).toContain('demo.mp4');
  });

  test('handles single file gracefully', () => {
    const prompt = createIVXOwnerMultiFileUnderstandingPrompt({ files: [makeInsight(0, 'image/png')] });
    expect(prompt).toContain('1 file');
    expect(prompt).toContain('1 image');
    expect(prompt).toContain('"Received 1 file (1 image).');
  });

  test('handles empty input safely', () => {
    const prompt = createIVXOwnerMultiFileUnderstandingPrompt({ files: [] });
    expect(prompt).toContain('none were received');
  });

  test('embeds excerpts when available so AI cannot ignore content', () => {
    const file = makeInsight(0, 'image/png', { excerpt: 'Login screen with broken submit button' });
    const prompt = createIVXOwnerMultiFileUnderstandingPrompt({ files: [file] });
    expect(prompt).toContain('Readable excerpt: Login screen with broken submit button');
  });
});
