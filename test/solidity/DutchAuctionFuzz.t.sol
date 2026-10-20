// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {DutchAuction} from "../../contracts/DutchAuction.sol";
import {LaunchToken} from "../../contracts/LaunchToken.sol";

/// @notice Property-based tests: each test runs against hundreds of random inputs.
contract DutchAuctionFuzzTest is Test {
    uint256 internal constant SUPPLY = 1_000e18;
    uint256 internal constant START_PRICE = 0.02 ether;
    uint256 internal constant RESERVE_PRICE = 0.005 ether;
    uint256 internal constant DURATION = 1_200;
    uint256 internal constant BIDDERS = 6;

    LaunchToken internal token;
    DutchAuction internal auction;
    uint256 internal start;

    function setUp() public {
        token = new LaunchToken("FairLaunch Token", "FAIR", SUPPLY, address(this));
        auction = new DutchAuction(token, SUPPLY, START_PRICE, RESERVE_PRICE, address(this));
        token.transfer(address(auction), SUPPLY);
        auction.start();
        start = auction.startTime();
    }

    receive() external payable {}

    function testFuzz_PriceIsMonotonicAndBounded(uint256 earlier, uint256 later) public view {
        earlier = bound(earlier, 0, 2 * DURATION);
        later = bound(later, earlier, 2 * DURATION);

        uint256 earlierPrice = auction.priceAt(start + earlier);
        uint256 laterPrice = auction.priceAt(start + later);

        assertLe(laterPrice, earlierPrice);
        assertLe(earlierPrice, START_PRICE);
        assertGe(laterPrice, RESERVE_PRICE);
    }

    /// Random bidders arrive at random times with random budgets. Whatever happens:
    /// - each bidder pays only for what was accepted and gets the surplus back at once,
    /// - only the bid that clears the auction can be partially accepted,
    /// - every bidder receives commitment / finalPrice tokens (one uniform price),
    /// - total claims never exceed supply and every token is claimed, burned or still held,
    /// - after the issuer withdraws, the auction holds exactly the outstanding refund credits.
    function testFuzz_SettlementIsUniformFairAndConserving(
        uint256[BIDDERS] memory amounts,
        uint256[BIDDERS] memory gaps
    ) public {
        address[BIDDERS] memory bidders;
        uint256 timestamp = start;

        for (uint256 i; i < BIDDERS; i++) {
            bidders[i] = address(uint160(0xB1D000 + i));
            timestamp += bound(gaps[i], 0, DURATION / BIDDERS);
            amounts[i] = bound(amounts[i], 1, 8 ether);

            vm.warp(timestamp);
            if (auction.status() != DutchAuction.Status.Active) {
                break;
            }

            vm.deal(bidders[i], amounts[i]);
            vm.prank(bidders[i]);
            auction.contribute{value: amounts[i]}();

            uint256 accepted = auction.commitments(bidders[i]);
            assertLe(accepted, amounts[i]);
            assertEq(bidders[i].balance, amounts[i] - accepted, "surplus not returned");
            if (accepted < amounts[i]) {
                assertTrue(auction.status() == DutchAuction.Status.Cleared, "partial fill without clearing");
            }
        }

        vm.warp(start + DURATION);
        auction.finalize();
        uint256 finalPrice = auction.finalPrice();
        assertGe(finalPrice, RESERVE_PRICE);
        assertLe(finalPrice, START_PRICE);

        uint256 claimedTotal;
        for (uint256 i; i < BIDDERS; i++) {
            uint256 commitment = auction.commitments(bidders[i]);
            if (commitment == 0) {
                continue;
            }
            vm.prank(bidders[i]);
            auction.claimTokens();
            uint256 tokens = token.balanceOf(bidders[i]);
            assertEq(tokens, (commitment * 1e18) / finalPrice, "non-uniform price");
            claimedTotal += tokens;
        }

        assertLe(claimedTotal, SUPPLY);
        assertLe(claimedTotal, auction.totalTokensSold());
        assertEq(token.balanceOf(address(auction)) + claimedTotal + auction.burnedUnsold(), SUPPLY);
        assertEq(token.totalSupply(), SUPPLY - auction.burnedUnsold());

        if (auction.totalCommitted() != 0) {
            auction.withdrawIssuerProceeds(payable(address(this)));
        }
        assertEq(address(auction).balance, auction.refundLiability());
    }

    /// A single early bid that is too small to clear immediately clears later purely through
    /// falling prices, at the exact price where it buys the whole supply.
    function testFuzz_TimeClearingPriceIsExact(uint256 amount) public {
        amount = bound(amount, auction.maxCommitmentAt(RESERVE_PRICE), auction.maxCommitmentAt(START_PRICE) - 1);

        auction.contribute{value: amount}();
        vm.warp(start + DURATION);
        auction.finalize();

        uint256 expected = (amount * 1e18 + SUPPLY - 1) / SUPPLY;
        assertTrue(auction.cleared());
        assertEq(auction.finalPrice(), expected);
        assertLe(auction.totalTokensSold(), SUPPLY);
        // Rounding the price up leaves at most a sliver of supply unsold.
        assertLe(SUPPLY - auction.totalTokensSold(), SUPPLY / 1e15);
    }
}
