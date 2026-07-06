import { describe, expect, test } from 'bun:test';
import {
  buildSeniorDeveloperBrainAnswer,
  buildSeniorDeveloperModeStatusAnswer,
  detectSeniorDeveloperBrainRequest,
  detectSeniorDeveloperModeStatusRequest,
  detectDeveloperModeRequest,
} from './ivx-owner-ai-dev-mode';

describe('IVX Owner AI Senior Developer Brain', () => {
  test('detects senior-developer mode status questions', () => {
    expect(detectSeniorDeveloperModeStatusRequest('Do you in a senior developer mode?')).toBe(true);
    expect(detectSeniorDeveloperModeStatusRequest('Are you a senior developer?')).toBe(true);
    expect(detectSeniorDeveloperModeStatusRequest('Switch to developer mode')).toBe(true);
  });

  test('detects senior-developer brain requests', () => {
    expect(detectSeniorDeveloperBrainRequest('I want my senior developer to have same brain like you')).toBe(true);
    expect(detectSeniorDeveloperBrainRequest('Answer exactly what I ask like a senior developer')).toBe(true);
    expect(detectSeniorDeveloperBrainRequest('Act as senior developer')).toBe(true);
    expect(detectSeniorDeveloperBrainRequest('Audit and fix senior developer')).toBe(true);
    expect(detectSeniorDeveloperBrainRequest('Senior developer is not working')).toBe(true);
    expect(detectSeniorDeveloperBrainRequest('Real senior developer ready to start work now')).toBe(true);
  });

  test('does not misclassify normal chat as brain request', () => {
    expect(detectSeniorDeveloperBrainRequest('What is Casa Rosario?')).toBe(false);
    expect(detectSeniorDeveloperBrainRequest('How do I invest?')).toBe(false);
  });

  test('status answer is positive and points to real executor', () => {
    const answer = buildSeniorDeveloperModeStatusAnswer();
    expect(answer).toContain('YES');
    expect(answer).toContain('CAPABILITIES');
    expect(answer).toContain('Run a senior developer task');
  });

  test('brain answer is direct and ready, not BLOCKED', () => {
    const answer = buildSeniorDeveloperBrainAnswer();
    expect(answer).toContain('I am IVX Senior Developer mode');
    expect(answer).toContain('same brain');
    expect(answer).toContain('STATUS: READY');
    expect(answer).not.toContain('STATE: BLOCKED');
    expect(answer).not.toContain('EXACT_ACTION_REQUIRED');
  });

  test('developer mode only blocks explicit immediate execution commands', () => {
    expect(detectDeveloperModeRequest('deploy now')).toBe(true);
    expect(detectDeveloperModeRequest('run senior developer task')).toBe(true);
    expect(detectDeveloperModeRequest('act as senior developer')).toBe(false);
    expect(detectDeveloperModeRequest('audit and fix senior developer')).toBe(false);
    expect(detectDeveloperModeRequest('fix the chat bug')).toBe(false);
    expect(detectDeveloperModeRequest('explain my Supabase RLS')).toBe(false);
  });
});
