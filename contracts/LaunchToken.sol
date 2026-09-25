// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/// @title LaunchToken
/// @notice Fixed-supply ERC20 token used by the FairLaunch Dutch auction.
contract LaunchToken is ERC20, ERC20Burnable, Ownable {
    error InvalidInitialSupply();

    uint256 public immutable maxSupply;

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 initialSupply_,
        address initialOwner_
    ) ERC20(name_, symbol_) Ownable(initialOwner_) {
        if (initialSupply_ == 0) {
            revert InvalidInitialSupply();
        }

        maxSupply = initialSupply_;
        _mint(initialOwner_, initialSupply_);
    }
}

