import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AI_MODEL,
  buildSystemPrompt,
  sanitizeAssistantText,
} from '../../src/lib/chat';

describe('chat knowledge grounding', () => {
  it('includes package prices and anti-hallucination rules', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('Che Xu Studio AI assistant');
    expect(prompt).toContain('CAD $1,499');
    expect(prompt).toContain('CAD $4,999');
    expect(prompt).toContain('Custom Website + SEO Launch');
    expect(prompt).toContain('Never fabricate prices');
    expect(prompt).toContain('Never promise specific search-engine rankings');
    expect(prompt).not.toContain('Premium Theme');
    expect(prompt).not.toContain('CAD $1,999');
  });

  it('strips HTML from model output', () => {
    expect(sanitizeAssistantText('<script>alert(1)</script>Hello')).toBe('alert(1)Hello');
  });

  it('defaults to an active Workers AI instruct-fast model', () => {
    expect(DEFAULT_AI_MODEL).toBe('@cf/meta/llama-3.1-8b-instruct-fast');
  });
});
