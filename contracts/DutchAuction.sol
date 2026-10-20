// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IBurnableERC20 is IERC20 {
    function burn(uint256 value) external;
}

/// @title DutchAuction
/// @notice One-shot uniform-price Dutch auction used by DutchPoint to launch Gavora (GVRA).
/// @dev Bidders commit ETH while the price falls linearly from `startPrice` to `reservePrice`
///      over 20 minutes. The auction clears once committed ETH can buy the whole sale supply,
///      and every bidder pays that single clearing price.
///
///      Allocation rule: commitments are filled in arrival order. Every commitment accepted
///      before clearing is filled in full at the clearing price. The bid that crosses the
///      threshold is accepted only up to the remaining capacity, and its surplus is refunded
///      in the same transaction. Bids after clearing are rejected.
///
///      Supply invariant: totalCommitted * TOKEN_SCALE / finalPrice <= saleSupply, so the sum
///      of all claims can never exceed the tokens held for the sale.
contract DutchAuction is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status {
        Pending,
        Active,
        Cleared,
        AwaitingFinalization,
        Finalized
    }

    uint256 public constant AUCTION_DURATION = 20 minutes;
    uint256 public constant TOKEN_SCALE = 1e18;

    IERC20 public immutable token;
    uint256 public immutable saleSupply;
    /// @notice Prices are quoted in wei per whole token (1e18 token units).
    uint256 public immutable startPrice;
    uint256 public immutable reservePrice;

    bool public started;
    bool public finalized;
    /// @notice True once finalized if demand met supply at or above the reserve price.
    bool public cleared;

    uint256 public startTime;
    uint256 public lastCommitmentTimestamp;
    /// @notice Set immediately by a crossing bid, or at finalization for clearing caused by time.
    uint256 public clearingTime;
    uint256 public clearingPrice;
    uint256 public finalPrice;

    /// @notice Accepted ETH only; crossing-bid surplus is never counted.
    uint256 public totalCommitted;
    uint256 public totalTokensSold;
    uint256 public totalTokensClaimed;
    uint256 public burnedUnsold;

    uint256 public participantCount;
    uint256 public claimedParticipantCount;

    /// @notice Surplus refunds that could not be pushed automatically and await withdrawal.
    uint256 public refundLiability;
    uint256 public issuerProceedsWithdrawn;

    mapping(address account => uint256 amount) public commitments;
    mapping(address account => uint256 amount) public refundCredits;
    mapping(address account => uint256 amount) public tokensClaimed;
    mapping(address account => bool done) public claimed;

    error InvalidAddress();
    error InvalidPrices();
    error InvalidSaleSupply();
    error AuctionAlreadyStarted();
    error AuctionNotStarted();
    error AuctionNotFunded(uint256 required, uint256 actual);
    error AuctionClosed();
    error AuctionAlreadyCleared();
    error AuctionNotFinalizable(uint256 earliest);
    error AuctionAlreadyFinalized();
    error AuctionNotFinalized();
    error ZeroContribution();
    error NoCommitment();
    error AlreadyClaimed();
    error NoRefundAvailable();
    error NoProceedsAvailable();
    error RefundTransferFailed();
    error ProceedsTransferFailed();
    error OutstandingClaims(uint256 claimedCount, uint256 totalParticipants);
    error NoTokensToBurn();

    event AuctionStarted(uint256 indexed startTime, uint256 indexed endTime);
    event ContributionReceived(
        address indexed account,
        uint256 amount,
        uint256 accepted,
        uint256 price,
        uint256 totalCommitted
    );
    event AuctionCleared(uint256 indexed clearingTime, uint256 clearingPrice, uint256 totalCommitted);
    event SurplusRefunded(address indexed account, uint256 amount);
    event RefundCredited(address indexed account, uint256 amount);
    event RefundWithdrawn(address indexed account, address indexed recipient, uint256 amount);
    event AuctionFinalized(bool cleared, uint256 finalPrice, uint256 totalTokensSold);
    event TokensClaimed(address indexed account, uint256 tokens);
    event IssuerProceedsWithdrawn(address indexed recipient, uint256 amount);
    event TokensBurned(uint256 amount);

    constructor(
        IERC20 token_,
        uint256 saleSupply_,
        uint256 startPrice_,
        uint256 reservePrice_,
        address initialOwner
    ) Ownable(initialOwner) {
        if (address(token_) == address(0)) {
            revert InvalidAddress();
        }
        if (startPrice_ <= reservePrice_ || reservePrice_ == 0) {
            revert InvalidPrices();
        }
        // The whole supply must be worth at least 1 wei at the reserve price, otherwise the
        // auction could never clear.
        if (saleSupply_ == 0 || Math.mulDiv(saleSupply_, reservePrice_, TOKEN_SCALE) == 0) {
            revert InvalidSaleSupply();
        }

        token = token_;
        saleSupply = saleSupply_;
        startPrice = startPrice_;
        reservePrice = reservePrice_;
    }

    receive() external payable nonReentrant {
        _contribute(msg.sender, msg.value);
    }

    // ---------------------------------------------------------------------
    // Issuer actions
    // ---------------------------------------------------------------------

    /// @notice Opens the 20-minute bidding window. The sale supply must already be deposited.
    function start() external onlyOwner {
        if (started) {
            revert AuctionAlreadyStarted();
        }

        uint256 inventory = token.balanceOf(address(this));
        if (inventory < saleSupply) {
            revert AuctionNotFunded(saleSupply, inventory);
        }

        started = true;
        startTime = block.timestamp;
        lastCommitmentTimestamp = block.timestamp;

        emit AuctionStarted(block.timestamp, block.timestamp + AUCTION_DURATION);
    }

    /// @notice Sends the sale revenue (all accepted ETH) to `recipient` after finalization.
    /// @dev Refund credits are tracked separately in `refundLiability`, so withdrawing proceeds
    ///      can never consume ETH owed back to bidders.
    function withdrawIssuerProceeds(address payable recipient) external onlyOwner nonReentrant {
        if (recipient == address(0)) {
            revert InvalidAddress();
        }
        if (!finalized) {
            revert AuctionNotFinalized();
        }

        uint256 amount = totalCommitted - issuerProceedsWithdrawn;
        if (amount == 0) {
            revert NoProceedsAvailable();
        }

        issuerProceedsWithdrawn += amount;

        (bool ok, ) = recipient.call{value: amount}("");
        if (!ok) {
            revert ProceedsTransferFailed();
        }

        emit IssuerProceedsWithdrawn(recipient, amount);
    }

    // ---------------------------------------------------------------------
    // Bidder actions
    // ---------------------------------------------------------------------

    /// @notice Commits ETH at the current price. Any amount beyond what is needed to buy the
    ///         remaining supply is refunded in the same transaction.
    function contribute() external payable nonReentrant {
        _contribute(msg.sender, msg.value);
    }

    /// @notice Transfers the caller's tokens at the final clearing price.
    function claimTokens() external nonReentrant {
        if (!finalized) {
            revert AuctionNotFinalized();
        }
        uint256 commitment = commitments[msg.sender];
        if (commitment == 0) {
            revert NoCommitment();
        }
        if (claimed[msg.sender]) {
            revert AlreadyClaimed();
        }

        uint256 tokens = Math.mulDiv(commitment, TOKEN_SCALE, finalPrice);

        claimed[msg.sender] = true;
        claimedParticipantCount += 1;
        tokensClaimed[msg.sender] = tokens;
        totalTokensClaimed += tokens;

        emit TokensClaimed(msg.sender, tokens);

        if (tokens != 0) {
            token.safeTransfer(msg.sender, tokens);
        }
    }

    /// @notice Withdraws a surplus refund that could not be pushed automatically
    ///         (for example because the bidder is a contract that rejects ETH).
    function withdrawRefundTo(address payable recipient) external nonReentrant {
        if (recipient == address(0)) {
            revert InvalidAddress();
        }

        uint256 amount = refundCredits[msg.sender];
        if (amount == 0) {
            revert NoRefundAvailable();
        }

        refundCredits[msg.sender] = 0;
        refundLiability -= amount;

        (bool ok, ) = recipient.call{value: amount}("");
        if (!ok) {
            revert RefundTransferFailed();
        }

        emit RefundWithdrawn(msg.sender, recipient, amount);
    }

    // ---------------------------------------------------------------------
    // Settlement
    // ---------------------------------------------------------------------

    /// @notice Fixes the final price and burns unsold tokens. Callable by anyone once the
    ///         20-minute window has ended.
    function finalize() external nonReentrant {
        if (!started) {
            revert AuctionNotStarted();
        }
        if (finalized) {
            revert AuctionAlreadyFinalized();
        }

        uint256 closeTime = endTime();
        if (block.timestamp < closeTime) {
            revert AuctionNotFinalizable(closeTime);
        }

        if (clearingTime == 0) {
            (bool byTime, uint256 price, uint256 time) = _timeClearing(closeTime);
            if (byTime) {
                clearingTime = time;
                clearingPrice = price;
                emit AuctionCleared(time, price, totalCommitted);
            }
        }

        finalized = true;
        cleared = clearingTime != 0;
        finalPrice = cleared ? clearingPrice : reservePrice;
        totalTokensSold = Math.mulDiv(totalCommitted, TOKEN_SCALE, finalPrice);

        _burnUnsold(saleSupply - totalTokensSold);

        emit AuctionFinalized(cleared, finalPrice, totalTokensSold);
    }

    /// @notice Burns rounding dust left after every participant has claimed.
    /// @dev Each claim rounds down, so up to one token unit per participant can remain.
    ///      Burning it earlier could destroy tokens that are still owed.
    function burnRemainderAfterAllClaimed() external nonReentrant {
        if (!finalized) {
            revert AuctionNotFinalized();
        }
        if (claimedParticipantCount != participantCount) {
            revert OutstandingClaims(claimedParticipantCount, participantCount);
        }

        uint256 amount = token.balanceOf(address(this));
        if (amount == 0) {
            revert NoTokensToBurn();
        }

        _burnUnsold(amount);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function endTime() public view returns (uint256) {
        if (!started) {
            return 0;
        }
        return startTime + AUCTION_DURATION;
    }

    function status() public view returns (Status) {
        if (finalized) {
            return Status.Finalized;
        }
        if (!started) {
            return Status.Pending;
        }
        if (block.timestamp >= endTime()) {
            return Status.AwaitingFinalization;
        }
        (bool isCleared, , ) = clearingState();
        return isCleared ? Status.Cleared : Status.Active;
    }

    /// @notice The price bidders face now; once the auction has cleared, the locked clearing price.
    function currentPrice() external view returns (uint256) {
        if (finalized) {
            return finalPrice;
        }
        (bool isCleared, uint256 price, ) = clearingState();
        if (isCleared) {
            return price;
        }
        return priceAt(block.timestamp);
    }

    /// @notice Whether the auction has cleared, including clearing caused by time passing with
    ///         no transaction to record it.
    function clearingState() public view returns (bool isCleared, uint256 price, uint256 time) {
        if (clearingTime != 0) {
            return (true, clearingPrice, clearingTime);
        }
        if (!started) {
            return (false, 0, 0);
        }
        uint256 closeTime = endTime();
        return _timeClearing(block.timestamp < closeTime ? block.timestamp : closeTime);
    }

    /// @notice Linear price decay, floored at the reserve price.
    function priceAt(uint256 timestamp) public view returns (uint256) {
        if (!started || timestamp <= startTime) {
            return startPrice;
        }

        uint256 elapsed = timestamp - startTime;
        if (elapsed >= AUCTION_DURATION) {
            return reservePrice;
        }

        return startPrice - Math.mulDiv(startPrice - reservePrice, elapsed, AUCTION_DURATION);
    }

    /// @notice Most ETH the auction can accept in total at `price` without exceeding supply.
    function maxCommitmentAt(uint256 price) public view returns (uint256) {
        return Math.mulDiv(saleSupply, price, TOKEN_SCALE);
    }

    /// @notice ETH that can still be accepted at the current price before the auction clears.
    function remainingCapacity() external view returns (uint256) {
        if (status() != Status.Active) {
            return 0;
        }
        uint256 cap = maxCommitmentAt(priceAt(block.timestamp));
        return cap > totalCommitted ? cap - totalCommitted : 0;
    }

    /// @notice Tokens `account` is entitled to. Before finalization this is a lower bound,
    ///         because the final price can only be at or below the current price.
    function tokensOwed(address account) external view returns (uint256 tokens, bool isFinal) {
        uint256 commitment = commitments[account];
        if (finalized) {
            return (Math.mulDiv(commitment, TOKEN_SCALE, finalPrice), true);
        }
        if (commitment == 0 || !started) {
            return (0, false);
        }
        (bool isCleared, uint256 price, ) = clearingState();
        return (Math.mulDiv(commitment, TOKEN_SCALE, isCleared ? price : priceAt(block.timestamp)), false);
    }

    // ---------------------------------------------------------------------
    // Internal logic
    // ---------------------------------------------------------------------

    function _contribute(address account, uint256 amount) private {
        if (!started) {
            revert AuctionNotStarted();
        }
        if (amount == 0) {
            revert ZeroContribution();
        }
        if (block.timestamp >= endTime()) {
            revert AuctionClosed();
        }
        (bool isCleared, , ) = clearingState();
        if (isCleared) {
            revert AuctionAlreadyCleared();
        }

        uint256 price = priceAt(block.timestamp);
        uint256 cap = maxCommitmentAt(price);
        uint256 capacity = cap > totalCommitted ? cap - totalCommitted : 0;
        uint256 accepted = amount < capacity ? amount : capacity;
        uint256 surplus = amount - accepted;

        // Effects
        if (accepted != 0) {
            if (commitments[account] == 0) {
                participantCount += 1;
            }
            commitments[account] += accepted;
            totalCommitted += accepted;
        }
        lastCommitmentTimestamp = block.timestamp;

        emit ContributionReceived(account, amount, accepted, price, totalCommitted);

        if (amount >= capacity) {
            clearingTime = block.timestamp;
            clearingPrice = price;
            emit AuctionCleared(block.timestamp, price, totalCommitted);
        }

        // Interaction last: return the surplus of a crossing bid.
        if (surplus != 0) {
            _refundSurplus(account, surplus);
        }
    }

    /// @dev Pushes the refund; if the recipient rejects ETH the amount is credited for a later
    ///      `withdrawRefundTo`, so a rejecting bidder can never block their own clearing bid
    ///      from being recorded or leave ETH unaccounted for.
    function _refundSurplus(address account, uint256 amount) private {
        (bool ok, ) = payable(account).call{value: amount}("");
        if (ok) {
            emit SurplusRefunded(account, amount);
        } else {
            refundCredits[account] += amount;
            refundLiability += amount;
            emit RefundCredited(account, amount);
        }
    }

    /// @dev Clearing caused by time: with no new bids, the price keeps falling until the ETH
    ///      already committed buys the whole supply. Because the decay is continuous, that
    ///      happens exactly at price ceil(totalCommitted / saleSupply), which becomes the
    ///      clearing price. Rounding up keeps total claims within the sale supply.
    function _timeClearing(
        uint256 timestamp
    ) private view returns (bool isCleared, uint256 price, uint256 time) {
        if (!started || totalCommitted == 0) {
            return (false, 0, 0);
        }

        price = Math.mulDiv(totalCommitted, TOKEN_SCALE, saleSupply, Math.Rounding.Ceil);
        if (price < reservePrice) {
            return (false, 0, 0);
        }

        time = _earliestTimeAtOrBelow(price);
        // The committed capital only existed from the latest commitment onwards.
        if (time < lastCommitmentTimestamp) {
            time = lastCommitmentTimestamp;
        }
        if (time > timestamp) {
            return (false, 0, 0);
        }
        return (true, price, time);
    }

    /// @dev First timestamp at which `priceAt` is at or below `price` (reserve <= price).
    function _earliestTimeAtOrBelow(uint256 price) private view returns (uint256) {
        if (price >= startPrice) {
            return startTime;
        }
        uint256 elapsed = Math.mulDiv(
            startPrice - price,
            AUCTION_DURATION,
            startPrice - reservePrice,
            Math.Rounding.Ceil
        );
        return startTime + elapsed;
    }

    function _burnUnsold(uint256 amount) private {
        if (amount == 0) {
            return;
        }

        burnedUnsold += amount;
        IBurnableERC20(address(token)).burn(amount);
        emit TokensBurned(amount);
    }
}
