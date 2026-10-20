// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IAuctionForRejectingReceiver {
    function contribute() external payable;

    function claimTokens() external;

    function withdrawRefundTo(address payable recipient) external;
}

/// @notice Test-only helper that rejects direct ETH refunds.
contract RejectingReceiver {
    IAuctionForRejectingReceiver public immutable auction;

    constructor(IAuctionForRejectingReceiver auction_) {
        auction = auction_;
    }

    receive() external payable {
        revert("RejectingReceiver: ETH rejected");
    }

    function contribute() external payable {
        auction.contribute{value: msg.value}();
    }

    function claimTokens() external {
        auction.claimTokens();
    }

    function withdrawToSelf() external {
        auction.withdrawRefundTo(payable(address(this)));
    }

    function withdrawTo(address payable recipient) external {
        auction.withdrawRefundTo(recipient);
    }
}

