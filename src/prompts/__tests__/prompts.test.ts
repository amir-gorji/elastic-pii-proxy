import { describe, it, expect } from 'vitest';
import { allPrompts } from '../index';
import { getMessages as getInvestigateMessages } from '../investigateFailedTransactions';
import { getMessages as getComplianceMessages } from '../complianceAuditQuery';
import { getMessages as getPerformanceMessages } from '../performanceInvestigation';

const extra = {} as any;

describe('prompts registry', () => {
  it('listPrompts returns all 3 prompts', async () => {
    const prompts = await allPrompts.listPrompts({ extra });
    expect(prompts).toHaveLength(3);
  });

  it('each prompt has required fields', async () => {
    const prompts = await allPrompts.listPrompts({ extra });
    for (const prompt of prompts) {
      expect(prompt.name).toBeTruthy();
      expect(prompt.description).toBeTruthy();
      expect(prompt.arguments).toBeDefined();
      expect(prompt.arguments!.length).toBeGreaterThan(0);
    }
  });

  it('lists the expected prompt names', async () => {
    const prompts = await allPrompts.listPrompts({ extra });
    const names = prompts.map((p) => p.name);
    expect(names).toContain('investigate-failed-transactions');
    expect(names).toContain('compliance-audit-query');
    expect(names).toContain('performance-investigation');
  });

  it('each prompt has at least one required argument', async () => {
    const prompts = await allPrompts.listPrompts({ extra });
    for (const prompt of prompts) {
      const hasRequired = prompt.arguments!.some((arg) => arg.required === true);
      expect(hasRequired).toBe(true);
    }
  });

  it('getPromptMessages returns messages for valid prompt', async () => {
    const messages = await allPrompts.getPromptMessages!({
      name: 'investigate-failed-transactions',
      args: { failure_description: 'test' },
      extra,
    });
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toHaveProperty('type', 'text');
  });

  it('getPromptMessages throws for unknown prompt', async () => {
    await expect(
      allPrompts.getPromptMessages!({ name: 'nonexistent', args: {}, extra }),
    ).rejects.toThrow('Unknown prompt');
  });
});

describe('investigate-failed-transactions prompt', () => {
  it('fills all placeholders with provided arguments', () => {
    const messages = getInvestigateMessages({
      failure_description: 'SWIFT payments timing out',
      index_pattern: 'payments-*',
      time_range: 'now-7d',
    });
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content.text).toContain('SWIFT payments timing out');
    expect(messages[0].content.text).toContain('payments-*');
    expect(messages[0].content.text).toContain('now-7d');
    expect(messages[0].content.text).not.toContain('{{');
  });

  it('uses default values for optional arguments', () => {
    const messages = getInvestigateMessages({
      failure_description: 'errors spiking',
    });
    expect(messages[0].content.text).toContain('transactions-*');
    expect(messages[0].content.text).toContain('now-24h');
    expect(messages[0].content.text).not.toContain('{{');
  });

  it('contains all 8 steps', () => {
    const messages = getInvestigateMessages({ failure_description: 'test' });
    const text = messages[0].content.text;
    expect(text).toContain('Step 1');
    expect(text).toContain('Step 8');
    expect(text).toContain('Recommend Next Steps');
  });
});

describe('compliance-audit-query prompt', () => {
  it('fills all placeholders with provided arguments', () => {
    const messages = getComplianceMessages({
      audit_scope: 'access to cardholder data',
      time_range: 'now-90d',
      index_pattern: 'security-audit-*',
    });
    expect(messages[0].content.text).toContain('access to cardholder data');
    expect(messages[0].content.text).toContain('now-90d');
    expect(messages[0].content.text).toContain('security-audit-*');
    expect(messages[0].content.text).not.toContain('{{');
  });

  it('uses default values for optional arguments', () => {
    const messages = getComplianceMessages({
      audit_scope: 'privileged user actions',
      time_range: 'now-30d',
    });
    expect(messages[0].content.text).toContain('audit-*');
    expect(messages[0].content.text).not.toContain('{{');
  });

  it('contains all 7 steps', () => {
    const messages = getComplianceMessages({ audit_scope: 'test', time_range: 'now-30d' });
    const text = messages[0].content.text;
    expect(text).toContain('Step 1');
    expect(text).toContain('Step 7');
    expect(text).toContain('Document Query Reproducibility');
  });
});

describe('performance-investigation prompt', () => {
  it('fills all placeholders with provided arguments', () => {
    const messages = getPerformanceMessages({
      symptom: 'latency increased 3x',
      time_range: 'now-12h',
      service_name: 'payment-gateway',
    });
    expect(messages[0].content.text).toContain('latency increased 3x');
    expect(messages[0].content.text).toContain('now-12h');
    expect(messages[0].content.text).toContain('payment-gateway');
    expect(messages[0].content.text).not.toContain('{{');
  });

  it('uses default values for optional arguments', () => {
    const messages = getPerformanceMessages({
      symptom: 'slow responses',
    });
    expect(messages[0].content.text).toContain('now-6h');
    expect(messages[0].content.text).toContain('All services');
    expect(messages[0].content.text).not.toContain('{{');
  });

  it('contains all 8 steps', () => {
    const messages = getPerformanceMessages({ symptom: 'test' });
    const text = messages[0].content.text;
    expect(text).toContain('Step 1');
    expect(text).toContain('Step 8');
    expect(text).toContain('Recommend Actions');
  });
});
