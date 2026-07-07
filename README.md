# Parametric Payout Agent

**Autonomous insurance payouts when external conditions cross a threshold.**

Parametric Payout Agent is an on-chain parametric insurance settlement system on the Casper blockchain. An owner creates policies with payout amounts and trigger thresholds, funds a reserve pool, and an oracle agent submits signed external readings. When a reading crosses the threshold, the contract pays the insured automatically. Built with the Odra 2.8.2 framework for Casper 2.0.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Smart Contracts](#smart-contracts)
- [Contract Addresses](#contract-addresses)
- [Getting Started](#getting-started)
- [Frontend](#frontend)
- [Security](#security)
- [License](#license)
- [Links](#links)

---

## Overview

Parametric Payout Agent replaces slow, subjective claims processing with transparent trigger-based settlement. Farmers, event operators, and logistics teams define policies with numeric thresholds. An AI agent purchases signed sensor or weather readings via an x402-style data endpoint, then submits the reading on-chain. The contract either records the reading (no trigger) or executes an automatic payout (trigger met). All state transitions emit auditable events readable via CSPR.cloud.

### Key Metrics (Testnet)

| Metric | Value |
|--------|-------|
| **Network** | Casper Testnet |
| **Framework** | Odra 2.8.2 |
| **Agent Port** | 4020 |
| **Data Provider Port** | 4021 |
| **Web Port** | 3000 |

---

## Features

- **Parametric Policies**: Payout amount and numeric threshold defined on-chain
- **Reserve Pool Funding**: Owner tops up native CSPR via payable `fund_pool`
- **Automatic Settlement**: Payout executes when reading crosses threshold
- **Honest Non-Trigger Path**: Sub-threshold readings recorded without payout
- **Signed Data Readings**: x402-style paid data provider with HMAC signing
- **AI Orchestration**: Agent coordinates data purchase and on-chain submission
- **CSPR.click Integration**: Wallet-connected policy management in the web UI
- **Event Timeline**: Full audit trail via CSPR.cloud

---

## Architecture

```
                    +------------------+
                    |   Owner Wallet   |
                    |   (CSPR.click)   |
                    +--------+---------+
                             |
           create_policy / fund_pool
                             v
+----------------------------------------------------------+
|           ParametricPolicy Contract (Odra)                |
|  - create_policy(): Define insured, payout, threshold       |
|  - fund_pool(): Deposit CSPR into reserve pool            |
|  - submit_reading(): Trigger check and payout             |
+---------------------------+------------------------------+
                            ^
                            | submit_reading()
                            |
+----------------------------------------------------------+
|              Agent Server (port 4020)                       |
|  - POST /api/payout-check: Orchestrate payout flow        |
|  - Purchase signed reading from data provider             |
|  - Build and submit on-chain reading transaction          |
+---------------------------+------------------------------+
                            |
                            | x402 payment
                            v
+----------------------------------------------------------+
|           Data Provider (port 4021)                       |
|  - Serve signed sensor/weather readings                   |
|  - HMAC-signed responses for oracle trust                 |
+---------------------------+------------------------------+
                            |
                            v
+----------------------------------------------------------+
|              Web UI (Next.js)                             |
|  - Connect wallet via CSPR.click                          |
|  - Create policies and fund pool                          |
|  - View PayoutExecuted / ReadingRecorded events           |
+----------------------------------------------------------+
```

### Settlement Flow

```
+--------+   buy reading    +-------------+   submit_reading   +------------------+
| Agent  | --------------> | Data Prov.  |                    | ParametricPolicy |
| (4020) |                 |   (4021)    |                    |                  |
|        |                 |             |                    |                  |
|        | ----------------------------------------------->  |                  |
|        |                 |             |   reading >= thr?  |                  |
|        |                 |             |   yes: PayoutExec  |                  |
|        |                 |             |   no:  ReadingRec  |                  |
+--------+                 +-------------+                    +------------------+
```

---

## Smart Contracts

### ParametricPolicy

The core parametric insurance contract managing policies, reserve funding, and automatic payouts.

**Entry Points:**

| Function | Description | Parameters |
|----------|-------------|------------|
| `init` | Initialize contract with deployer as owner | - |
| `create_policy` | Create a new parametric policy | `policy_id: u64, insured: Address, payout_amount: U512, threshold: u64` |
| `fund_pool` | Deposit native CSPR into reserve pool | `payable` |
| `submit_reading` | Submit data reading and evaluate trigger | `policy_id: u64, reading: u64, data_source_hash: String` |

**Events:**

| Event | Description |
|-------|-------------|
| `PolicyCreated` | Owner created a new policy |
| `PoolFunded` | Owner deposited CSPR into the reserve pool |
| `ReadingRecorded` | Reading submitted but threshold not met |
| `PayoutExecuted` | Reading crossed threshold and payout sent to insured |

---

## Contract Addresses

### Casper Testnet

| Contract | Package Hash | Deploy Transaction | Explorer |
|----------|--------------|-------------------|----------|
| **ParametricPolicy** | `hash-a72b00d8e50ef0d2e9c50398887d88fea20e28a2e0e3c3429f52f2ea23ac5708` | `f3932f1dd07095e1954f627d95724c74c396c61d2227ae3ae41ca98a7b1ef07d` | [View on cspr.live](https://testnet.cspr.live/package/hash-a72b00d8e50ef0d2e9c50398887d88fea20e28a2e0e3c3429f52f2ea23ac5708) |

### Network Configuration

| Setting | Value |
|---------|-------|
| **Chain Name** | `casper-test` |
| **Node URL** | `https://node.testnet.casper.network` |
| **CSPR.cloud RPC** | `https://node.testnet.cspr.cloud/rpc` |
| **Explorer** | `https://testnet.cspr.live` |

---

## Getting Started

### Prerequisites

- Rust 1.70+
- Cargo
- Odra CLI 2.8.2
- Node.js 18+
- Casper testnet account funded via the [testnet faucet](https://testnet.cspr.live/tools/faucet)

### Build Contracts

```bash
cd contract
cargo odra test
cargo odra build
```

Wasm output lands at `contract/wasm/ParametricPolicy.wasm`.

### Deploy Contracts

```bash
casper-client put-transaction session \
  --node-address https://node.testnet.cspr.cloud/rpc \
  --chain-name casper-test \
  --secret-key /path/to/secret_key.pem \
  --wasm-path ./wasm/ParametricPolicy.wasm \
  --install-upgrade \
  --pricing-mode fixed \
  --gas-price-tolerance 1 \
  --payment-amount 300000000000
```

Record the contract hash from the deploy result and set it in environment files below.

### Run Agent and Data Provider

```bash
cd agent
npm install
cp .env.example .env
npm run dev
```

This starts:

- **Agent server** at `http://localhost:4020` (`POST /api/payout-check`)
- **Data provider** at `http://localhost:4021` (signed sensor readings)

### Run Web UI

```bash
cd web
npm install
cp .env.local.example .env.local
npm run dev
```

Web UI available at `http://localhost:3000`.

---

## Frontend

The web app is a Next.js application with CSPR.click wallet integration.

### Pages

- **Home**: Connect wallet, create policies, fund reserve pool
- **Payout Check**: Trigger agent payout evaluation for a policy
- **Event Timeline**: Display `PayoutExecuted` and `ReadingRecorded` events from CSPR.cloud

### Wallet Integration

Uses [CSPR.click](https://cspr.click) for wallet connection supporting:

- Casper Wallet
- Ledger
- Torus Wallet
- CasperDash
- MetaMask Snap

### Environment Variables

**Agent (`agent/.env`):**

```env
OPENROUTER_API_KEY=sk-or-...
DATA_PROVIDER_SECRET=your-secret-key-for-hmac-signing
CONTRACT_HASH=hash-a72b00d8e50ef0d2e9c50398887d88fea20e28a2e0e3c3429f52f2ea23ac5708
CASPER_NODE_ADDRESS=https://node.testnet.cspr.cloud/rpc
DATA_PROVIDER_URL=http://localhost:4021
```

**Web (`web/.env.local`):**

```env
NEXT_PUBLIC_CSPR_CLICK_APP_ID=your_cspr_click_app_id
NEXT_PUBLIC_AGENT_URL=http://localhost:4020
NEXT_PUBLIC_CONTRACT_HASH=hash-a72b00d8e50ef0d2e9c50398887d88fea20e28a2e0e3c3429f52f2ea23ac5708
CONTRACT_HASH=hash-a72b00d8e50ef0d2e9c50398887d88fea20e28a2e0e3c3429f52f2ea23ac5708
CSPR_CLOUD_ACCESS_KEY=your_cspr_cloud_token_here
```

---

## Security

### Access Control

- Owner-only functions: `create_policy`, `fund_pool`, `submit_reading`
- Only the owner (acting as oracle agent in this MVP) can submit readings

### Settlement Safety

- Policies can only be paid once (`AlreadyPaid` guard)
- Payout reverts if reserve pool balance is insufficient
- Sub-threshold readings recorded without state change to `paid`

### Oracle Trust

- Data provider responses are HMAC-signed
- `data_source_hash` stored on-chain with every reading
- MVP uses a single oracle key; production should use multi-source attestation

### Audits

- [ ] Pending security audit

---

## License

MIT License. See [LICENSE](./LICENSE) for details.

---

## Links

- **GitHub**: [aarav1656/casper-parametric-payout-agent](https://github.com/aarav1656/casper-parametric-payout-agent)
- **Testnet Explorer**: [cspr.live](https://testnet.cspr.live)
- **Package**: [ParametricPolicy on testnet](https://testnet.cspr.live/package/hash-a72b00d8e50ef0d2e9c50398887d88fea20e28a2e0e3c3429f52f2ea23ac5708)
- **Deploy Transaction**: [f3932f1d...](https://testnet.cspr.live/deploy/f3932f1dd07095e1954f627d95724c74c396c61d2227ae3ae41ca98a7b1ef07d)
- **Casper Documentation**: [docs.casper.network](https://docs.casper.network)
- **Odra Framework**: [odra.dev](https://odra.dev)
- **CSPR.click**: [cspr.click](https://cspr.click)
- **CSPR.cloud**: [cspr.cloud](https://cspr.cloud)
