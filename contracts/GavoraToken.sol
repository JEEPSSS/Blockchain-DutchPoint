// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/// @title GavoraToken
/// @notice Gavora (GVRA), the ERC20 token launched through DutchPoint's Dutch auction.
/// @dev The whole supply is minted once at deployment and there is no mint function, so no
///      account - not even the deployer - can inflate the supply later. Holders, including the
///      auction contract, can burn their own tokens; that is how unsold inventory is destroyed.
contract GavoraToken is ERC20, ERC20Burnable {
    error InvalidInitialSupply();

    constructor(uint256 initialSupply, address recipient) ERC20("Gavora", "GVRA") {
        if (initialSupply == 0) {
            revert InvalidInitialSupply();
        }
        _mint(recipient, initialSupply);
    }
}
