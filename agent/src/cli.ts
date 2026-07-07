import { runPayoutCheck } from "./agent.js";

const args = process.argv.slice(2);

if (args.length < 2) {
  console.error("Usage: tsx src/cli.ts <policyId> <threshold> [readingId]");
  console.error("Example: tsx src/cli.ts POLICY-001 5.0 FLOOD-2024-004");
  process.exit(1);
}

const policyId = args[0];
const threshold = parseFloat(args[1]);
const readingId = args[2];

if (isNaN(threshold)) {
  console.error("Error: threshold must be a number");
  process.exit(1);
}

console.log("\n=== Parametric Payout Agent CLI ===\n");

(async () => {
  try {
    const result = await runPayoutCheck(policyId, threshold, readingId);

    console.log("\n=== PAYOUT CHECK RESULT ===\n");
    console.log(`Policy ID:              ${result.policyId}`);
    console.log(`Reading:                ${result.reading} ${result.unit}`);
    console.log(`Threshold:              ${result.threshold} ${result.unit}`);
    console.log(`Threshold Crossed:      ${result.thresholdCrossed}`);
    console.log(`Data Signature Valid:   ${result.dataSignatureValid}`);
    console.log(`\nAI Analysis:`);
    console.log(`  ${result.aiExplanation}`);
    console.log(`\nRecommendation:         ${result.recommendation}`);
    console.log(`Timestamp:              ${result.timestamp}`);
    console.log();

    process.exit(0);
  } catch (error: any) {
    console.error("\nError during payout check:");
    console.error(error.message || error);
    process.exit(1);
  }
})();
