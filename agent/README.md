# Parametric Payout Agent

Autonomous insurance payout agent that fetches external sensor data through an x402 paid data provider, verifies HMAC signatures, and uses AI to determine policy payouts.

## Architecture

### Services

1. **Data Provider** (port 4021): Serves signed sensor readings with x402 payment handshake
2. **Agent Server** (port 4020): Orchestrates payout checks via HTTP API or CLI
3. **Agent Logic**: Fetches data, verifies signatures, runs AI analysis

## HTTP 402 Payment Flow

The x402 protocol ensures trustworthy data delivery:

```
Client Request:
  GET /reading/:readingId

Server Response (first request):
  HTTP/402 Payment Required
  {
    "error": "Payment Required",
    "price": 100,
    "payment_reference": "PAYMENT-123...",
    "message": "Include X-Payment header with payment reference"
  }

Client Payment Simulation:
  GET /reading/:readingId
  Headers: X-Payment: PAYMENT-123...

Server Response (paid request):
  HTTP/200 OK
  {
    "reading": { /* sensor data */ },
    "payload": "JSON string",
    "signature": "hex HMAC-SHA256",
    "signed_at": "ISO8601"
  }
```

## HMAC Signature Verification

Data integrity is protected by HMAC-SHA256:

1. Data provider signs the JSON payload with a shared secret
2. Client receives the payload and signature
3. Client recomputes the signature using the same secret
4. Client compares both signatures (constant-time comparison)
5. Only valid signatures are processed downstream

The signature covers only the sensor data (id, timestamp, location, value, unit), protecting against tampering while allowing transparent audit trails.

## Setup

```bash
cd /Users/kamal/Desktop/caspa/hackathon-ideas/parametric-payout-agent/agent

# Install dependencies (ignore postinstall scripts for security)
npm install --ignore-scripts

# Create .env from example
cp .env.example .env

# Set your OpenRouter API key in .env
export OPENROUTER_API_KEY="sk-or-..."
export DATA_PROVIDER_SECRET="your-dev-secret"
```

## Running

### Type Check
```bash
npm run typecheck
```

### Start Data Provider (terminal 1)
```bash
npm run provider
```

### Start Agent Server (terminal 2)
```bash
npm run dev
```

### Run CLI Test (trigger case, above threshold)
```bash
npm run cli -- POLICY-001 6.0 FLOOD-2024-004
```

### Run CLI Test (non-trigger case, below threshold)
```bash
npm run cli -- POLICY-002 5.0 FLOOD-2024-001
```

### Test Suite (both cases)
```bash
npm test
```

### HTTP Server Test
```bash
curl -X POST http://localhost:4020/api/payout-check \
  -H "Content-Type: application/json" \
  -d '{"policyId": "POL-123", "threshold": 6.0, "readingId": "FLOOD-2024-004"}'
```

## Scenario Data

`src/readings.json` contains 8 realistic flood level readings over a 14-hour period:
- FLOOD-2024-001: 2.3m (normal)
- FLOOD-2024-002: 3.8m (rising)
- FLOOD-2024-003: 5.2m (moderate flood)
- FLOOD-2024-004: 6.8m (severe flood)
- FLOOD-2024-005: 7.9m (extreme flood)
- FLOOD-2024-006: 6.5m (receding)
- FLOOD-2024-007: 4.1m (returning)
- FLOOD-2024-008: 2.5m (normal)

Typical policy threshold: 5.5-6.0 meters.

## Output Example

### Trigger Case (above threshold)
```
[agent] Starting payout check for policy: POLICY-001, threshold: 6.0
[data-client] Fetching reading: FLOOD-2024-004
[data-client] HTTP 402 Payment Required received. Reference: PAYMENT-...
[data-client] Simulating payment settlement
[data-client] Received signed reading from data provider
[data-client] HMAC signature verification: PASS
[agent] Reading value: 6.8 meters
[agent] Analysis complete. Threshold crossed: true
[agent] AI explanation: The reading of 6.8 meters exceeds the 6.0 meter threshold, triggering the parametric payout clause for flood damage coverage.

=== PAYOUT CHECK RESULT ===
Policy ID:              POLICY-001
Reading:                6.8 meters
Threshold:              6.0 meters
Threshold Crossed:      true
Data Signature Valid:   true
AI Analysis:
  The reading of 6.8 meters exceeds the 6.0 meter threshold, triggering the parametric payout clause for flood damage coverage.
Recommendation:         EXECUTE_PAYOUT
```

### Non-Trigger Case (below threshold)
```
[agent] Starting payout check for policy: POLICY-002, threshold: 5.5
[data-client] Fetching reading: FLOOD-2024-001
[data-client] HTTP 402 Payment Required received. Reference: PAYMENT-...
[data-client] Simulating payment settlement
[data-client] Received signed reading from data provider
[data-client] HMAC signature verification: PASS
[agent] Reading value: 2.3 meters
[agent] Analysis complete. Threshold crossed: false
[agent] AI explanation: The reading of 2.3 meters is well below the 5.5 meter threshold, indicating normal conditions without triggering the parametric insurance claim.

=== PAYOUT CHECK RESULT ===
Policy ID:              POLICY-002
Reading:                2.3 meters
Threshold:              5.5 meters
Threshold Crossed:      false
Data Signature Valid:   true
AI Analysis:
  The reading of 2.3 meters is well below the 5.5 meter threshold, indicating normal conditions without triggering the parametric insurance claim.
Recommendation:         REJECT_CLAIM
```

## Environment Variables

- `OPENROUTER_API_KEY`: OpenRouter API key for Claude Haiku
- `DATA_PROVIDER_SECRET`: Shared secret for HMAC signing (dev default: "dev-secret-key")
- `DATA_PROVIDER_URL`: Base URL of data provider (default: http://localhost:4021)
- `CONTRACT_HASH`: Deployed Odra contract hash (placeholder for demo)
- `CASPER_NODE_ADDRESS`: Casper network RPC endpoint

## Contract Integration (Future)

The agent outputs a `PayoutCheckResult` that includes:
- `policyId`: on-chain policy identifier
- `reading`: sensor value
- `threshold`: policy threshold
- `thresholdCrossed`: boolean outcome
- `recommendation`: EXECUTE_PAYOUT or REJECT_CLAIM
- `dataSignatureValid`: proof of data integrity
- `aiExplanation`: human-readable reasoning

Future versions will submit this result to the Odra contract's `submit_reading` entrypoint with the signature as `data_source_hash`.

## Security Notes

1. **HMAC Secret**: The shared secret (DATA_PROVIDER_SECRET) must be:
   - Generated securely (e.g., `openssl rand -hex 32`)
   - Stored in environment variables, never hardcoded
   - Rotated periodically in production
   - Different between dev, staging, and production

2. **Constant-Time Comparison**: The signature verification uses `crypto.timingSafeEqual` to prevent timing attacks.

3. **Payment Reference Invalidation**: Payment references are single-use and deleted after validation.

4. **AI Model**: Uses Claude Haiku 4.5 for cost-efficient reasoning; configurable via OpenRouter to any supported model.

## Testing Checklist

- [x] TypeScript compilation passes
- [x] Data provider serves readings with HTTP 402
- [x] Payment reference flow works
- [x] HMAC signature generation and verification pass
- [x] Data client handles 402 handshake
- [x] AI analysis produces deterministic output
- [x] CLI runs both trigger and non-trigger cases
- [x] Server accepts POST /api/payout-check requests
- [x] All error paths return proper HTTP status codes
- [x] No sensitive data logged (secrets, payment refs only once)
