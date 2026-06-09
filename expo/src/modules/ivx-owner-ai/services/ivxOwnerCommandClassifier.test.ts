import { describe, expect, it } from 'bun:test';
import {
  classifyLatestOwnerCommand,
  isOwnerExecutionOrTaskBlock,
  resolveExactEchoCommand,
} from './ivxOwnerCommandClassifier';

describe('resolveExactEchoCommand', () => {
  it('returns the verbatim payload for an exact-echo command', () => {
    expect(resolveExactEchoCommand('Reply exactly OWNER proof-123')).toBe('OWNER proof-123');
    expect(resolveExactEchoCommand('respond exactly: hello world')).toBe('hello world');
    expect(resolveExactEchoCommand('say exactly "Keep CASE And Symbols!"')).toBe('Keep CASE And Symbols!');
  });

  it('returns null for non-echo messages', () => {
    expect(resolveExactEchoCommand('What is Casa Rosario?')).toBeNull();
    expect(resolveExactEchoCommand('reply with a summary of the deal')).toBeNull();
    expect(resolveExactEchoCommand('')).toBeNull();
  });
});

describe('isOwnerExecutionOrTaskBlock', () => {
  it('detects explicit BLOCK/STEP/PHASE headers', () => {
    expect(isOwnerExecutionOrTaskBlock('BLOCK 28 Visitor-to-Investor Conversion Engine')).toBe(true);
    expect(isOwnerExecutionOrTaskBlock('Step 3: wire the pipeline')).toBe(true);
  });

  it('detects structured spec blocks with multiple markers', () => {
    const block = 'Create: a new screen\nTrack: engagement\nDashboard: show counts\nRequirements: owner only';
    expect(isOwnerExecutionOrTaskBlock(block)).toBe(true);
  });

  it('detects imperative engine/system build commands (>= 90 chars)', () => {
    expect(
      isOwnerExecutionOrTaskBlock('Build a complete visitor-to-investor conversion engine and wire it end to end into the owner dashboard workflow now'),
    ).toBe(true);
  });

  it('does not treat a short engine phrase as a task block', () => {
    expect(isOwnerExecutionOrTaskBlock('build the engine')).toBe(false);
  });

  it('does not treat normal conversation as a task block', () => {
    expect(isOwnerExecutionOrTaskBlock('What projects do I have?')).toBe(false);
    expect(isOwnerExecutionOrTaskBlock('Tell me about Casa Rosario.')).toBe(false);
  });
});

describe('classifyLatestOwnerCommand', () => {
  it('classifies exact-echo and flags privileged execution', () => {
    const result = classifyLatestOwnerCommand('Reply exactly OWNER proof-123');
    expect(result.commandClass).toBe('exact_echo');
    expect(result.echoPayload).toBe('OWNER proof-123');
    expect(result.requiresPrivilegedExecution).toBe(true);
  });

  it('classifies task blocks and flags privileged execution', () => {
    const result = classifyLatestOwnerCommand('BLOCK 30 — build the outreach engine');
    expect(result.commandClass).toBe('execution_task_block');
    expect(result.echoPayload).toBeNull();
    expect(result.requiresPrivilegedExecution).toBe(true);
  });

  it('classifies a normal question as conversational', () => {
    const result = classifyLatestOwnerCommand('Which project has the highest ROI?');
    expect(result.commandClass).toBe('conversational');
    expect(result.requiresPrivilegedExecution).toBe(false);
  });
});
