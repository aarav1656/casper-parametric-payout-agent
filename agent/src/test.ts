import { runPayoutCheck } from "./agent.js";

console.log("=== Parametric Payout Agent E2E Test ===\n");

async function runTests() {
  console.log("Test 1: Non-trigger case (reading below threshold)\n");
  console.log("---");
  try {
    const result1 = await runPayoutCheck(
      "POLICY-TEST-001",
      5.5,
      "FLOOD-2024-001"
    );
    console.log("\nTest 1 Result:");
    console.log(`  Reading: ${result1.reading} ${result1.unit}`);
    console.log(`  Threshold: ${result1.threshold} ${result1.unit}`);
    console.log(`  Threshold Crossed: ${result1.thresholdCrossed}`);
    console.log(`  Data Signature Valid: ${result1.dataSignatureValid}`);
    console.log(`  Recommendation: ${result1.recommendation}`);
    console.log(`  AI Explanation: ${result1.aiExplanation}`);

    if (
      !result1.thresholdCrossed &&
      result1.recommendation === "REJECT_CLAIM" &&
      result1.dataSignatureValid
    ) {
      console.log("  Status: PASS\n");
    } else {
      console.log("  Status: FAIL\n");
      process.exit(1);
    }
  } catch (err: any) {
    console.error("  Status: FAIL");
    console.error("  Error:", err.message);
    process.exit(1);
  }

  console.log("Test 2: Trigger case (reading above threshold)\n");
  console.log("---");
  try {
    const result2 = await runPayoutCheck(
      "POLICY-TEST-002",
      6.0,
      "FLOOD-2024-004"
    );
    console.log("\nTest 2 Result:");
    console.log(`  Reading: ${result2.reading} ${result2.unit}`);
    console.log(`  Threshold: ${result2.threshold} ${result2.unit}`);
    console.log(`  Threshold Crossed: ${result2.thresholdCrossed}`);
    console.log(`  Data Signature Valid: ${result2.dataSignatureValid}`);
    console.log(`  Recommendation: ${result2.recommendation}`);
    console.log(`  AI Explanation: ${result2.aiExplanation}`);

    if (
      result2.thresholdCrossed &&
      result2.recommendation === "EXECUTE_PAYOUT" &&
      result2.dataSignatureValid
    ) {
      console.log("  Status: PASS\n");
    } else {
      console.log("  Status: FAIL\n");
      process.exit(1);
    }
  } catch (err: any) {
    console.error("  Status: FAIL");
    console.error("  Error:", err.message);
    process.exit(1);
  }

  console.log("=== All tests passed ===\n");
  process.exit(0);
}

runTests();
