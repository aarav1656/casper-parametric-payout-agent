//! ParametricPolicy: on-chain parametric insurance settlement.
//!
//! The owner creates a policy for an insured address with a payout amount and a
//! trigger threshold, then funds a shared native-token reserve pool. An oracle
//! agent (the owner's key in this MVP) submits a data reading tied to a
//! `data_source_hash`. When the reading crosses the threshold the contract pays
//! the insured out of the pool and marks the policy settled; otherwise the
//! reading is recorded on-chain with no payout, the honest non-trigger case.
//!
//! This module exercises owner-gated writes, struct-in-mapping storage
//! (`#[odra::odra_type]`), typed errors (`#[odra::odra_error]`), events
//! (`#[odra::event]`), a payable entrypoint that accepts native CSPR
//! (`#[odra(payable)]` + `attached_value`), and `transfer_tokens` for payout.

use odra::casper_types::U512;
use odra::prelude::*;

/// A parametric insurance policy stored in the contract.
///
/// Structs used inside `Mapping` values (or returned from entrypoints) must be
/// annotated with `#[odra::odra_type]` so Odra can (de)serialize them.
#[odra::odra_type]
pub struct Policy {
    /// The address that receives the payout when the policy triggers.
    pub insured: Address,
    /// The amount (in motes) paid out when the trigger condition is met.
    pub payout_amount: U512,
    /// The reading value at or above which the policy triggers.
    pub threshold: u64,
    /// Whether the policy has already been paid out.
    pub paid: bool,
}

/// Errors returned to callers. Field-less enum with explicit discriminants so the
/// on-chain error codes are stable across builds.
#[odra::odra_error]
pub enum Error {
    /// A non-owner tried to call an owner-only entrypoint.
    NotOwner = 1,
    /// A policy with this id already exists.
    PolicyExists = 2,
    /// No policy exists for the given id.
    NoPolicy = 3,
    /// The policy has already been paid out.
    AlreadyPaid = 4,
    /// The reserve pool does not hold enough native tokens to cover the payout.
    InsufficientPool = 5,
}

/// Emitted when the owner creates a new policy.
#[odra::event]
pub struct PolicyCreated {
    pub policy_id: u64,
    pub insured: Address,
    pub payout_amount: U512,
    pub threshold: u64,
}

/// Emitted when the owner tops up the reserve pool.
#[odra::event]
pub struct PoolFunded {
    pub amount: U512,
}

/// Emitted when a submitted reading does not cross the threshold. The honest
/// non-trigger case: no payout, no state change to `paid`.
#[odra::event]
pub struct ReadingRecorded {
    pub policy_id: u64,
    pub reading: u64,
    pub threshold: u64,
    pub data_source_hash: String,
}

/// Emitted when a submitted reading crosses the threshold and the payout executes.
#[odra::event]
pub struct PayoutExecuted {
    pub policy_id: u64,
    pub insured: Address,
    pub reading: u64,
    pub payout_amount: U512,
    pub data_source_hash: String,
}

/// The ParametricPolicy contract module.
#[odra::module(
    events = [PolicyCreated, PoolFunded, ReadingRecorded, PayoutExecuted],
    errors = Error
)]
pub struct ParametricPolicy {
    owner: Var<Address>,
    policies: Mapping<u64, Policy>,
}

#[odra::module]
impl ParametricPolicy {
    /// Initializes the contract with the deployer as the owner.
    pub fn init(&mut self) {
        self.owner.set(self.env().caller());
    }

    /// Creates a new policy for `insured`. Owner only. Reverts `PolicyExists` if
    /// `policy_id` is already in use.
    pub fn create_policy(
        &mut self,
        policy_id: u64,
        insured: Address,
        payout_amount: U512,
        threshold: u64,
    ) {
        self.assert_owner();
        if self.policies.get(&policy_id).is_some() {
            self.env().revert(Error::PolicyExists);
        }
        self.policies.set(
            &policy_id,
            Policy {
                insured,
                payout_amount,
                threshold,
                paid: false,
            },
        );
        self.env().emit_event(PolicyCreated {
            policy_id,
            insured,
            payout_amount,
            threshold,
        });
    }

    /// Owner deposits native tokens into the shared reserve pool. The pool
    /// balance is simply this contract's native token balance; there is no
    /// separate ledger to keep in sync.
    #[odra(payable)]
    pub fn fund_pool(&mut self) {
        let amount = self.env().attached_value();
        self.env().emit_event(PoolFunded { amount });
    }

    /// Submits a data reading for `policy_id`. Callable by the owner (acting as
    /// the oracle/agent key in this MVP). Reverts `NoPolicy` if the id is
    /// unknown, `AlreadyPaid` if the policy already settled. When `reading`
    /// crosses `threshold` the payout executes and `InsufficientPool` is
    /// returned if the contract's native balance cannot cover it. Otherwise the
    /// reading is recorded with no payout, the honest non-trigger case.
    pub fn submit_reading(&mut self, policy_id: u64, reading: u64, data_source_hash: String) {
        self.assert_owner();
        let mut policy = self
            .policies
            .get(&policy_id)
            .unwrap_or_revert_with(&self.env(), Error::NoPolicy);

        if policy.paid {
            self.env().revert(Error::AlreadyPaid);
        }

        if reading >= policy.threshold {
            let balance = self.env().self_balance();
            if balance < policy.payout_amount {
                self.env().revert(Error::InsufficientPool);
            }
            policy.paid = true;
            self.policies.set(&policy_id, policy.clone());
            self.env().transfer_tokens(&policy.insured, &policy.payout_amount);
            self.env().emit_event(PayoutExecuted {
                policy_id,
                insured: policy.insured,
                reading,
                payout_amount: policy.payout_amount,
                data_source_hash,
            });
        } else {
            self.env().emit_event(ReadingRecorded {
                policy_id,
                reading,
                threshold: policy.threshold,
                data_source_hash,
            });
        }
    }

    /// Returns the current owner.
    pub fn get_owner(&self) -> Address {
        self.owner.get_or_revert_with(Error::NotOwner)
    }

    /// Returns the policy for `policy_id`, or `None` if it does not exist.
    pub fn get_policy(&self, policy_id: u64) -> Option<Policy> {
        self.policies.get(&policy_id)
    }

    fn assert_owner(&self) {
        if self.env().caller() != self.owner.get_or_revert_with(Error::NotOwner) {
            self.env().revert(Error::NotOwner);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{Error, ParametricPolicy, ParametricPolicyHostRef, PayoutExecuted, ReadingRecorded};
    use odra::casper_types::U512;
    use odra::host::{Deployer, HostRef, NoArgs};

    const POLICY_ID: u64 = 1;
    const PAYOUT: u64 = 1_000u64;
    const THRESHOLD: u64 = 500u64;

    fn setup() -> (odra::host::HostEnv, ParametricPolicyHostRef) {
        let env = odra_test::env();
        // Account 0 is the deployer/owner.
        env.set_caller(env.get_account(0));
        let contract = ParametricPolicy::deploy(&env, NoArgs);
        (env, contract)
    }

    #[test]
    fn owner_is_deployer() {
        let (env, contract) = setup();
        assert_eq!(contract.get_owner(), env.get_account(0));
    }

    #[test]
    fn payout_executes_above_threshold() {
        let (env, mut contract) = setup();
        let insured = env.get_account(1);

        env.set_caller(env.get_account(0));
        contract.create_policy(POLICY_ID, insured, U512::from(PAYOUT), THRESHOLD);
        contract
            .with_tokens(U512::from(PAYOUT))
            .fund_pool();

        let insured_balance_before = env.balance_of(&insured);

        contract.submit_reading(POLICY_ID, THRESHOLD, "src-hash-above".to_string());

        assert!(env.emitted_event(
            &contract,
            PayoutExecuted {
                policy_id: POLICY_ID,
                insured,
                reading: THRESHOLD,
                payout_amount: U512::from(PAYOUT),
                data_source_hash: "src-hash-above".to_string(),
            }
        ));

        let insured_balance_after = env.balance_of(&insured);
        assert_eq!(insured_balance_after - insured_balance_before, U512::from(PAYOUT));

        let policy = contract.get_policy(POLICY_ID).unwrap();
        assert!(policy.paid);
    }

    #[test]
    fn reading_recorded_below_threshold_no_payout() {
        let (env, mut contract) = setup();
        let insured = env.get_account(1);

        env.set_caller(env.get_account(0));
        contract.create_policy(POLICY_ID, insured, U512::from(PAYOUT), THRESHOLD);
        contract.with_tokens(U512::from(PAYOUT)).fund_pool();

        let insured_balance_before = env.balance_of(&insured);

        let below_threshold = THRESHOLD - 1;
        contract.submit_reading(POLICY_ID, below_threshold, "src-hash-below".to_string());

        assert!(env.emitted_event(
            &contract,
            ReadingRecorded {
                policy_id: POLICY_ID,
                reading: below_threshold,
                threshold: THRESHOLD,
                data_source_hash: "src-hash-below".to_string(),
            }
        ));

        let insured_balance_after = env.balance_of(&insured);
        assert_eq!(insured_balance_before, insured_balance_after);

        let policy = contract.get_policy(POLICY_ID).unwrap();
        assert!(!policy.paid);
    }

    #[test]
    fn non_owner_cannot_create_policy() {
        let (env, mut contract) = setup();
        let insured = env.get_account(1);
        let non_owner = env.get_account(2);

        env.set_caller(non_owner);
        assert_eq!(
            contract.try_create_policy(POLICY_ID, insured, U512::from(PAYOUT), THRESHOLD),
            Err(Error::NotOwner.into())
        );
    }

    #[test]
    fn reverts_on_duplicate_policy_id() {
        let (env, mut contract) = setup();
        let insured = env.get_account(1);

        env.set_caller(env.get_account(0));
        contract.create_policy(POLICY_ID, insured, U512::from(PAYOUT), THRESHOLD);

        assert_eq!(
            contract.try_create_policy(POLICY_ID, insured, U512::from(PAYOUT), THRESHOLD),
            Err(Error::PolicyExists.into())
        );
    }

    #[test]
    fn reverts_submit_reading_without_policy() {
        let (env, mut contract) = setup();

        env.set_caller(env.get_account(0));
        assert_eq!(
            contract.try_submit_reading(999u64, THRESHOLD, "src".to_string()),
            Err(Error::NoPolicy.into())
        );
    }

    #[test]
    fn reverts_when_already_paid() {
        let (env, mut contract) = setup();
        let insured = env.get_account(1);

        env.set_caller(env.get_account(0));
        contract.create_policy(POLICY_ID, insured, U512::from(PAYOUT), THRESHOLD);
        contract.with_tokens(U512::from(PAYOUT)).fund_pool();

        contract.submit_reading(POLICY_ID, THRESHOLD, "src-1".to_string());

        assert_eq!(
            contract.try_submit_reading(POLICY_ID, THRESHOLD, "src-2".to_string()),
            Err(Error::AlreadyPaid.into())
        );
    }

    #[test]
    fn reverts_when_pool_underfunded() {
        let (env, mut contract) = setup();
        let insured = env.get_account(1);

        env.set_caller(env.get_account(0));
        contract.create_policy(POLICY_ID, insured, U512::from(PAYOUT), THRESHOLD);
        // Fund with less than the payout amount.
        contract.with_tokens(U512::from(PAYOUT - 1)).fund_pool();

        assert_eq!(
            contract.try_submit_reading(POLICY_ID, THRESHOLD, "src".to_string()),
            Err(Error::InsufficientPool.into())
        );
    }
}
