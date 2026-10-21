// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title VulnerableAuction
/// @notice DELIBERATELY VULNERABLE - test-only contract for the reentrancy demonstration.
///         Never deploy this outside a local test network.
/// @dev Reproduces the refund path a naive implementation tends to produce: the ETH transfer
///      happens before the refund balance is cleared, and nothing prevents re-entry. Compare
///      with DutchAuction.withdrawRefundTo, which clears the credit first (checks-effects-
///      interactions) and is guarded by ReentrancyGuard.
contract VulnerableAuction {
    /// @notice Total ETH the sale can absorb; anything above it becomes refundable.
    uint256 public immutable capacity;

    uint256 public totalCommitted;
    mapping(address account => uint256 amount) public commitments;
    mapping(address account => uint256 amount) public refundCredits;

    constructor(uint256 capacity_) {
        capacity = capacity_;
    }

    function contribute() external payable {
        uint256 room = capacity - totalCommitted;
        uint256 accepted = msg.value < room ? msg.value : room;
        commitments[msg.sender] += accepted;
        totalCommitted += accepted;
        refundCredits[msg.sender] += msg.value - accepted;
    }

    function withdrawRefund() external {
        uint256 amount = refundCredits[msg.sender];
        require(amount > 0, "no refund");

        // BUG: interaction before effect. A contract recipient can call back into
        // withdrawRefund() here and be paid again, because its credit is still non-zero.
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "transfer failed");

        refundCredits[msg.sender] = 0;
    }
}
