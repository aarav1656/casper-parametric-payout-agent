# Parametric Payout Agent

Autonomous insurance payouts when external conditions cross a threshold.

## User

Farmers, event operators, and logistics teams that need transparent trigger-based coverage.

## Problem

Claims processing is slow and subjective. Parametric products can pay automatically, but need trustworthy data and auditable settlement.

## Solution

Agent sells a policy, pays a data provider for a signed reading, and triggers an Odra payout when threshold terms are met.

## Casper primitives

Odra policy contract, x402 paid sensor/weather endpoint, event receipt, CSPR.cloud timeline.

## Demo wow

Simulated flood level crosses threshold. Agent pays data endpoint, posts proof, payout transaction executes.

## MVP scope

Policy creation, premium deposit, data request, threshold proof, payout, rejection for non-trigger case.

## Main risk

Oracle trust. Use multi-source placeholder design and show challenge path.

## Docs

- [PRD](PRD.md)
- [Build Plan](BUILD_PLAN.md)
- [Demo and Submission](DEMO_AND_SUBMISSION.md)
- [Risk Register](RISK_REGISTER.md)
