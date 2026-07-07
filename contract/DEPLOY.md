# Deploying ParametricPolicy

This contract is built with Odra 2.8.2 via `cargo-odra` 0.1.6, targeting the
Casper network. It has not been deployed by this build step; the commands below
are what a deployer runs next.

## Prerequisites

- `rustup target add wasm32-unknown-unknown` (once, for the wasm build)
- `casper-client` 5.0.0 or newer
- A funded Casper testnet account: generate keys with `casper-client keygen <dir>`
  and fund the public key at https://testnet.cspr.live/tools/faucet
- Never commit or paste a secret key. Supply the path to your own
  `secret_key.pem` at deploy time.

## 1. Run tests

```bash
cd contract
cargo odra test
```

## 2. Build the wasm artifact

```bash
cd contract
cargo odra build
```

Output lands at `contract/wasm/ParametricPolicy.wasm`.

## 3. Deploy to Casper testnet

Chain name for testnet is always `casper-test`.

**Preferred (current) command, `put-transaction session`:**

```bash
casper-client put-transaction session \
  --node-address <TESTNET_RPC> \
  --chain-name casper-test \
  --secret-key /path/to/secret_key.pem \
  --wasm-path ./wasm/ParametricPolicy.wasm \
  --install-upgrade \
  --pricing-mode fixed \
  --gas-price-tolerance 1 \
  --payment-amount 300000000000
```

**Legacy (still works on 5.0, prints a deprecation notice), `put-deploy`:**

```bash
casper-client put-deploy \
  --node-address <TESTNET_RPC> \
  --chain-name casper-test \
  --secret-key /path/to/secret_key.pem \
  --session-path ./wasm/ParametricPolicy.wasm \
  --payment-amount 300000000000
```

Both return a hash. Confirm execution:

```bash
casper-client get-deploy --node-address <TESTNET_RPC> <DEPLOY_HASH>
# or, for put-transaction:
casper-client get-transaction --node-address <TESTNET_RPC> <TXN_HASH>
```

`<TESTNET_RPC>` options:
- CSPR.cloud managed node (needs a CSPR.cloud access token, sent as the
  `authorization` header): `https://node.testnet.cspr.cloud/rpc`
- A public peer: pull a live IP from https://testnet.cspr.live/tools/peers and
  use `http://<peer_ip>:7777/rpc`.

`--payment-amount` is in motes (1 CSPR = 1,000,000,000 motes). 300000000000
motes = 300 CSPR is a safe starting budget for a contract install.

## 4. Post-deploy calls (contract entrypoints)

Once deployed, the contract hash is returned in the deploy/transaction receipt.
Use `casper-client put-transaction session` or the generated `bin/cli.rs`
(`cargo build --bin parametric_policy_cli`, then run with `--help`) for
scripted calls. The entrypoints are:

- `init()` runs once at deploy, sets the deployer as owner.
- `create_policy(policy_id, insured, payout_amount, threshold)` owner-only.
- `fund_pool()` payable, owner deposits native tokens (motes) into the pool by
  attaching value to the call.
- `submit_reading(policy_id, reading, data_source_hash)` owner/oracle-agent
  key. Pays out automatically when `reading >= threshold`.
- `get_owner()` and `get_policy(policy_id)` are read-only getters.

## 5. Notes

- The reserve pool is the contract's own native token balance. There is no
  separate ledger; `fund_pool()` just increases the contract's CSPR balance and
  emits `PoolFunded { amount }` for the amount attached to that call.
- `submit_reading` reverts with `InsufficientPool` if the contract balance is
  less than `payout_amount` at the moment a threshold-crossing reading is
  submitted. Fund the pool before submitting a triggering reading.
- No mainnet deployment is in scope for this MVP. See PRD.md non-goals.
