// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IAuctionForReentrantRefundAttacker {
    function contribute() external payable;

    function withdrawRefundTo(address payable recipient) external;
}

/// @notice Test-only helper that attempts refund withdrawal reentrancy.
contract ReentrantRefundAttacker {
    IAuctionForReentrantRefundAttacker public immutable auction;
    bool public attackEnabled;
    bool public reentrySucceeded;

    constructor(IAuctionForReentrantRefundAttacker auction_) {
        auction = auction_;
    }

    receive() external payable {
        if (attackEnabled) {
            attackEnabled = false;
            (bool ok, ) = address(auction).call(
                abi.encodeWithSignature("withdrawRefundTo(address)", payable(address(this)))
            );
            reentrySucceeded = ok;
        }
    }

    function contribute() external payable {
        auction.contribute{value: msg.value}();
    }

    function attackWithdraw() external {
        attackEnabled = true;
        auction.withdrawRefundTo(payable(address(this)));
    }
}

