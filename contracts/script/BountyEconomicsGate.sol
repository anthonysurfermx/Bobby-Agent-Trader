// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BobbyAdversarialBounties} from "../src/BobbyAdversarialBounties.sol";
import {HardnessRegistry} from "../src/HardnessRegistry.sol";

/// @title BountyEconomicsGate — Codex r5 [P1]. Both bounty contracts initialise
///        `treasury = msg.sender`, i.e. the deployer EOA. Ownership was handed to
///        the Safe; the treasury was not, so forfeited bonds would have flowed to
///        a hot key. This gate configures the treasury and both bonds while the
///        deployer still owns the contracts (BEFORE the two-step handoff) and
///        asserts the result — shared by DeployBase and the deployment tests so
///        the two can never disagree.
library BountyEconomicsGate {
    function configure(address bountiesAddr, address hardnessAddr, address treasury, uint96 challengeBond) internal {
        require(treasury != address(0), "BountyEconomicsGate: zero treasury");
        BobbyAdversarialBounties bounties = BobbyAdversarialBounties(payable(bountiesAddr));
        HardnessRegistry hardness = HardnessRegistry(payable(hardnessAddr));
        bounties.setTreasury(treasury);
        bounties.setChallengeBond(challengeBond);
        hardness.setTreasury(treasury);
        hardness.setBountyChallengeBond(challengeBond);
    }

    /// @dev Live proof, used by the deploy assertions and the verifier: both
    ///      treasuries equal `treasury`, both bonds equal `challengeBond`, and on
    ///      mainnet the treasury is never the deployer EOA.
    function assertConfigured(address bountiesAddr, address hardnessAddr, address treasury, uint96 challengeBond, address deployer)
        internal
        view
    {
        BobbyAdversarialBounties bounties = BobbyAdversarialBounties(payable(bountiesAddr));
        HardnessRegistry hardness = HardnessRegistry(payable(hardnessAddr));
        require(bounties.treasury() == treasury, "BountyEconomicsGate: bounties.treasury");
        require(hardness.treasury() == treasury, "BountyEconomicsGate: hardness.treasury");
        require(bounties.challengeBond() == challengeBond, "BountyEconomicsGate: bounties.challengeBond");
        require(hardness.bountyChallengeBond() == challengeBond, "BountyEconomicsGate: hardness.challengeBond");
        if (block.chainid == 8453) {
            require(treasury != deployer, "BountyEconomicsGate: treasury is the deployer EOA");
        }
    }
}
