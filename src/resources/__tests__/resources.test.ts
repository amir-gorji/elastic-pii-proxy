import { describe, it, expect } from 'vitest';
import { allResources } from '../index';
import { content as bankingQueryPatternsContent } from '../bankingQueryPatterns';
import { content as elasticsearchBestPracticesContent } from '../elasticsearchBestPractices';
import { content as bankingDomainGlossaryContent } from '../bankingDomainGlossary';

const extra = {} as any;

describe('resources registry', () => {
  it('listResources returns all 3 resources', async () => {
    const resources = await allResources.listResources({ extra });
    expect(resources).toHaveLength(3);
  });

  it('each resource has required fields', async () => {
    const resources = await allResources.listResources({ extra });
    for (const resource of resources) {
      expect(resource.uri).toBeTruthy();
      expect(resource.name).toBeTruthy();
      expect(resource.description).toBeTruthy();
      expect(resource.mimeType).toBe('text/markdown');
    }
  });

  it('lists the expected URIs', async () => {
    const resources = await allResources.listResources({ extra });
    const uris = resources.map((r) => r.uri);
    expect(uris).toContain('kibana-banking://resources/banking-query-patterns');
    expect(uris).toContain('kibana-banking://resources/elasticsearch-best-practices');
    expect(uris).toContain('kibana-banking://resources/banking-domain-glossary');
  });

  it('getResourceContent returns text for each valid URI', async () => {
    const resources = await allResources.listResources({ extra });
    for (const resource of resources) {
      const result = await allResources.getResourceContent({ uri: resource.uri, extra });
      expect(result).toHaveProperty('text');
      expect((result as { text: string }).text.length).toBeGreaterThan(100);
    }
  });

  it('getResourceContent throws for unknown URI', async () => {
    await expect(
      allResources.getResourceContent({ uri: 'kibana-banking://resources/nonexistent', extra }),
    ).rejects.toThrow('Unknown resource URI');
  });
});

describe('banking-query-patterns content', () => {
  it('contains transaction search patterns', () => {
    expect(bankingQueryPatternsContent).toContain('Transaction Search Patterns');
  });

  it('contains valid Elasticsearch DSL examples', () => {
    expect(bankingQueryPatternsContent).toContain('"bool"');
    expect(bankingQueryPatternsContent).toContain('"filter"');
    expect(bankingQueryPatternsContent).toContain('"term"');
  });

  it('contains aggregation patterns', () => {
    expect(bankingQueryPatternsContent).toContain('date_histogram');
    expect(bankingQueryPatternsContent).toContain('"terms"');
  });

  it('contains field type guidance', () => {
    expect(bankingQueryPatternsContent).toContain('.keyword');
  });
});

describe('elasticsearch-best-practices content', () => {
  it('contains all 8 sections', () => {
    expect(elasticsearchBestPracticesContent).toContain('Query Construction');
    expect(elasticsearchBestPracticesContent).toContain('Aggregation Guidelines');
    expect(elasticsearchBestPracticesContent).toContain('Performance');
    expect(elasticsearchBestPracticesContent).toContain('Security');
    expect(elasticsearchBestPracticesContent).toContain('Banking-Specific');
    expect(elasticsearchBestPracticesContent).toContain('Result Interpretation');
    expect(elasticsearchBestPracticesContent).toContain('Compliance Patterns');
    expect(elasticsearchBestPracticesContent).toContain('Common Mistakes');
  });

  it('contains numbered guidelines', () => {
    // Verify it has guidelines numbered into the 50s
    expect(elasticsearchBestPracticesContent).toMatch(/^5[0-8]\./m);
  });
});

describe('banking-domain-glossary content', () => {
  it('contains payment type definitions', () => {
    expect(bankingDomainGlossaryContent).toContain('SWIFT');
    expect(bankingDomainGlossaryContent).toContain('SEPA');
    expect(bankingDomainGlossaryContent).toContain('Card Payment');
  });

  it('contains transaction statuses', () => {
    expect(bankingDomainGlossaryContent).toContain('Transaction Statuses');
    expect(bankingDomainGlossaryContent).toContain('completed');
    expect(bankingDomainGlossaryContent).toContain('failed');
    expect(bankingDomainGlossaryContent).toContain('rejected');
  });

  it('contains compliance terms', () => {
    expect(bankingDomainGlossaryContent).toContain('PCI DSS');
    expect(bankingDomainGlossaryContent).toContain('GDPR');
    expect(bankingDomainGlossaryContent).toContain('AML');
  });

  it('contains time expressions', () => {
    expect(bankingDomainGlossaryContent).toContain('now-24h');
    expect(bankingDomainGlossaryContent).toContain('now/d');
  });
});
