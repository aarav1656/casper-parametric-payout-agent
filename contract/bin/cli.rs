//! `odra-cli` entrypoint for deploying and interacting with `ParametricPolicy`.
//!
//! Build the CLI binary with `cargo build --bin parametric_policy_cli` and run it
//! with `--help` to see the deploy and scenario commands.

use odra::host::{HostEnv, NoArgs};
use odra_cli::{
    deploy::DeployScript, ContractProvider, DeployedContractsContainer, DeployerExt, OdraCli,
};
use parametric_policy::parametric_policy::ParametricPolicy;

/// Deploys `ParametricPolicy` and registers it in the deployed-contracts container.
pub struct ParametricPolicyDeployScript;

impl DeployScript for ParametricPolicyDeployScript {
    fn deploy(
        &self,
        env: &HostEnv,
        container: &mut DeployedContractsContainer,
    ) -> Result<(), odra_cli::deploy::Error> {
        let _policy = ParametricPolicy::load_or_deploy(
            env,
            NoArgs,
            container,
            350_000_000_000, // gas limit in motes; adjust for the target network
        )?;
        Ok(())
    }
}

/// Main function to run the CLI tool.
pub fn main() {
    OdraCli::new()
        .about("CLI tool for the ParametricPolicy smart contract")
        .deploy(ParametricPolicyDeployScript)
        .contract::<ParametricPolicy>()
        .build()
        .run();
}
