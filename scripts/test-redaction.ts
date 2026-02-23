/**
 * Manual PII redaction demo script.
 *
 * Stage 1 (regex) runs unconditionally.
 * Stage 2 (AWS Comprehend NER) runs when the --comprehend flag is passed.
 *
 * Usage:
 *   npm run test:redaction                  # Stage 1 only
 *   npm run test:redaction -- --comprehend  # Both stages
 */
import { redactPII, redactPIIDeep } from '../src/lib/piiRedaction';

// ---------------------------------------------------------------------------
// Sample payload — simulates an Elasticsearch hits array from a transaction log
// ---------------------------------------------------------------------------
const samplePayload = {
  hits: {
    total: { value: 3 },
    hits: [
      {
        _id: 'txn-001',
        _source: {
          transaction_id: 'TXN-2024-001',
          // Stage 1: credit card (valid Luhn — WILL be redacted)
          card_number: '4111 1111 1111 1111',
          // Stage 1: IBAN
          iban: 'DE89370400440532013000',
          // Stage 1: US SSN
          ssn: '123-45-6789',
          // Stage 1: email
          email: 'john.doe@bank.com',
          // Stage 1: phone
          phone: '+31 6 1234 5678',
          amount: 1500.0,
          currency: 'EUR',
          status: 'completed',
        },
      },
      {
        _id: 'txn-002',
        _source: {
          transaction_id: 'TXN-2024-002',
          // Stage 1: invalid Luhn — NOT redacted (1234 5678 9012 3456 fails Luhn)
          card_number: '1234 5678 9012 3456',
          amount: 250.0,
          currency: 'USD',
          status: 'pending',
          // Stage 2 (NER): full name, street address, IP — only masked with --comprehend
          customer_name: 'John Doe',
          billing_address: '42 Main Street, Amsterdam',
          originating_ip: '192.168.1.101',
        },
      },
      {
        _id: 'txn-003',
        _source: {
          transaction_id: 'TXN-2024-003',
          // Stage 1: another valid card (Mastercard test number, valid Luhn)
          card_number: '5500 0000 0000 0004',
          // Stage 1: email in a free-text note
          notes: 'Customer support contact: support@example.com. Ref SSN 987-65-4321.',
          amount: 9999.99,
          currency: 'GBP',
          status: 'failed',
        },
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function printSection(title: string): void {
  const bar = '─'.repeat(60);
  console.log(`\n${bar}`);
  console.log(`  ${title}`);
  console.log(bar);
}

function printSummary(label: string, count: number, types: string[]): void {
  console.log(`\n  ${label}`);
  console.log(`  redactionCount : ${count}`);
  console.log(`  redactedTypes  : [${types.join(', ')}]`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const useComprehend = process.argv.includes('--comprehend');
  const awsRegion = process.env.AWS_REGION ?? 'us-east-1';

  printSection('RAW PAYLOAD');
  console.log(JSON.stringify(samplePayload, null, 2));

  printSection('STAGE 1: Regex redaction');
  const stage1 = redactPII(samplePayload);
  console.log(JSON.stringify(stage1.redactedData, null, 2));
  printSummary('Stage 1 summary', stage1.redactionCount, stage1.redactedTypes);

  // Highlight the invalid-Luhn card explicitly
  const txn002After = (stage1.redactedData as typeof samplePayload).hits.hits[1]._source;
  console.log(
    `\n  Invalid-Luhn card preserved : ${(txn002After as any).card_number}`,
  );

  if (!useComprehend) {
    printSection('STAGE 2 SKIPPED (pass --comprehend to enable)');
    console.log('');
    process.exit(0);
  }

  printSection(`STAGE 2: AWS Comprehend NER  (region: ${awsRegion})`);
  console.log('  Calling Comprehend... this may take a few seconds.\n');

  let stage2;
  try {
    stage2 = await redactPIIDeep(stage1.redactedData, {
      comprehendEnabled: true,
      awsRegion,
    });
  } catch (err: any) {
    console.error('  ERROR calling AWS Comprehend:', err?.message ?? err);
    console.error('  Ensure AWS credentials are configured and Comprehend is accessible.');
    process.exit(1);
  }

  console.log(JSON.stringify(stage2.redactedData, null, 2));
  printSummary('Stage 2 summary (cumulative)', stage2.redactionCount, stage2.redactedTypes);

  // Show incremental Stage 2 changes
  const incrementalCount = stage2.redactionCount - stage1.redactionCount;
  const incrementalTypes = stage2.redactedTypes.filter(
    (t) => !stage1.redactedTypes.includes(t),
  );
  console.log(`\n  Incremental Stage 2 redactions : ${incrementalCount}`);
  console.log(`  New types added by Stage 2     : [${incrementalTypes.join(', ')}]`);

  console.log('');
  process.exit(0);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
