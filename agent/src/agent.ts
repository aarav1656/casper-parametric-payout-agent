import { fetchSignedReading } from "./data-client.js";
import { analyzeReading } from "./ai.js";

export interface PayoutCheckResult {
  policyId: string;
  threshold: number;
  reading: number;
  unit: string;
  thresholdCrossed: boolean;
  recommendation: string;
  aiExplanation: string;
  dataSignatureValid: boolean;
  /** Hex HMAC-SHA256 signature of the sensor payload; used as the on-chain `data_source_hash`. */
  dataSourceHash: string;
  timestamp: string;
}

export async function runPayoutCheck(
  policyId: string,
  threshold: number,
  readingId: string = "FLOOD-2024-004"
): Promise<PayoutCheckResult> {
  console.log(
    `\n[agent] Starting payout check for policy: ${policyId}, threshold: ${threshold}`
  );

  const { reading, dataSignatureValid, dataSourceHash } = await fetchSignedReading(readingId);

  console.log(
    `[agent] Reading value: ${reading.value} ${reading.unit}, source: ${reading.location}`
  );

  const { thresholdCrossed, explanation } = await analyzeReading(
    reading.value,
    threshold,
    reading.unit
  );

  console.log(`[agent] Analysis complete. Threshold crossed: ${thresholdCrossed}`);
  console.log(`[agent] AI explanation: ${explanation}`);

  const recommendation = thresholdCrossed
    ? "EXECUTE_PAYOUT"
    : "REJECT_CLAIM";

  return {
    policyId,
    threshold,
    reading: reading.value,
    unit: reading.unit,
    thresholdCrossed,
    recommendation,
    aiExplanation: explanation,
    dataSignatureValid,
    dataSourceHash,
    timestamp: new Date().toISOString(),
  };
}
