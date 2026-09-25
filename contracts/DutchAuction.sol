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
/// @notice One-shot ETH-budget Dutch auction with uniform final price and pull refunds.
contract DutchAuction is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status {
        Pending,
        Active,
        Cleared,
        AwaitingFinalization,
        Finalized
    }

    uint256 public constant AUCTION_DURATION = 1200;
    uint256 public constant TOKEN_SCALE = 1e18;

    IERC20 public immutable token;
    address public immutable issuer;
    uint256 public immutable saleSupply;
    uint256 public immutable startPrice;
    uint256 public immutable reservePrice;

    bool public started;
    bool public finalized;
    bool public cleared;

    uint256 public startTime;
    uint256 public lastCommitmentTimestamp;
    uint256 public clearingTime;
    uint256 public clearingPrice;
    uint256 public finalPrice;

    uint256 public totalCommitted;
    uint256 public totalTokensSold;
    uint256 public totalTokensClaimed;
    uint256 public burnedUnsold;

    uint256 public participantCount;
    uint256 public settledParticipantCount;

    uint256 public refundLiability;
    uint256 public refundsWithdrawn;
    uint256 public issuerProceedsAvailable;
    uint256 public issuerProceedsWithdrawn;

    mapping(address account => uint256 amount) public commitments;
    mapping(address account => bool registered) public participantRegistered;
    mapping(address account => bool done) public settled;
    mapping(address account => uint256 amount) public refundCredits;
    mapping(address account => uint256 amount) public acceptedEthByAccount;
    mapping(address account => uint256 amount) public tokensClaimedByAccount;

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
    error ZeroContribution();
    error NoCommitment();
    error AlreadySettled();
    error NoRefundAvailable();
    error NoProceedsAvailable();
    error RefundTransferFailed();
    error ProceedsTransferFailed();
    error OutstandingSettlements(uint256 settledCount, uint256 totalParticipants);
    error NoTokensToBurn();

    event AuctionStarted(uint256 indexed startTime, uint256 indexed endTime);
    event ContributionReceived(address indexed account, uint256 amount, uint256 totalCommitted);
    event AuctionCleared(uint256 indexed clearingTime, uint256 clearingPrice, uint256 totalCommitted);
    event AuctionFinalized(bool cleared, uint256 finalPrice, uint256 totalTokensSold);
    event AccountSettled(address indexed account, uint256 tokens, uint256 acceptedEth, uint256 refund);
    event RefundWithdrawn(address indexed account, address indexed recipient, uint256 amount);
    event IssuerProceedsWithdrawn(address indexed recipient, uint256 amount);
    event TokensBurned(uint256 amount);

    constructor(
        IERC20 token_,
        uint256 saleSupply_,
        uint256 startPrice_,
        uint256 reservePrice_,
        address issuer_
    ) Ownable(issuer_) {
        if (address(token_) == address(0) || issuer_ == address(0)) {
            revert InvalidAddress();
        }
        if (saleSupply_ == 0) {
            revert InvalidSaleSupply();
        }
        if (startPrice_ <= reservePrice_ || reservePrice_ == 0) {
            revert InvalidPrices();
        }

        token = token_;
        saleSupply = saleSupply_;
        startPrice = startPrice_;
        reservePrice = reservePrice_;
        issuer = issuer_;
    }

    receive() external payable nonReentrant {
        _contribute(msg.sender, msg.value);
    }

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

    function contribute() external payable nonReentrant {
        _contribute(msg.sender, msg.value);
    }

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

        _syncTimeClearing(closeTime);

        finalized = true;
        if (clearingTime != 0) {
            cleared = true;
            finalPrice = clearingPrice;
            totalTokensSold = saleSupply;
        } else {
            cleared = false;
            finalPrice = reservePrice;
            totalTokensSold = Math.mulDiv(totalCommitted, TOKEN_SCALE, reservePrice);
            if (totalTokensSold > saleSupply) {
                totalTokensSold = saleSupply;
            }

            uint256 unsold = saleSupply - totalTokensSold;
            _burnUnsold(unsold);
        }

        emit AuctionFinalized(cleared, finalPrice, totalTokensSold);
    }

    function claimTokens() external nonReentrant {
        if (settled[msg.sender]) {
            revert AlreadySettled();
        }

        _settleAccount(msg.sender);
    }

    function withdrawRefundTo(address payable recipient) external nonReentrant {
        if (recipient == address(0)) {
            revert InvalidAddress();
        }

        if (!settled[msg.sender]) {
            _settleAccount(msg.sender);
        }

        uint256 amount = refundCredits[msg.sender];
        if (amount == 0) {
            revert NoRefundAvailable();
        }

        refundCredits[msg.sender] = 0;
        refundLiability -= amount;
        refundsWithdrawn += amount;

        (bool ok, ) = recipient.call{value: amount}("");
        if (!ok) {
            refundCredits[msg.sender] = amount;
            refundLiability += amount;
            refundsWithdrawn -= amount;
            revert RefundTransferFailed();
        }

        emit RefundWithdrawn(msg.sender, recipient, amount);
    }

    function withdrawIssuerProceeds(address payable recipient) external onlyOwner nonReentrant {
        if (recipient == address(0)) {
            revert InvalidAddress();
        }

        uint256 amount = issuerProceedsAvailable - issuerProceedsWithdrawn;
        if (amount == 0) {
            revert NoProceedsAvailable();
        }

        issuerProceedsWithdrawn += amount;

        (bool ok, ) = recipient.call{value: amount}("");
        if (!ok) {
            issuerProceedsWithdrawn -= amount;
            revert ProceedsTransferFailed();
        }

        emit IssuerProceedsWithdrawn(recipient, amount);
    }

    function burnRemainderAfterAllSettled() external nonReentrant {
        if (!finalized) {
            revert AuctionNotFinalizable(endTime());
        }
        if (settledParticipantCount != participantCount) {
            revert OutstandingSettlements(settledParticipantCount, participantCount);
        }

        uint256 amount = token.balanceOf(address(this));
        if (amount == 0) {
            revert NoTokensToBurn();
        }

        _burnUnsold(amount);
    }

    function currentPrice() external view returns (uint256) {
        if (clearingTime != 0) {
            return clearingPrice;
        }
        return priceAt(block.timestamp);
    }

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
        if (clearingTime != 0) {
            return Status.Cleared;
        }
        if (block.timestamp >= endTime()) {
            return Status.AwaitingFinalization;
        }
        return Status.Active;
    }

    function priceAt(uint256 timestamp) public view returns (uint256) {
        if (!started || timestamp <= startTime) {
            return startPrice;
        }

        uint256 elapsed = timestamp - startTime;
        if (elapsed >= AUCTION_DURATION) {
            return reservePrice;
        }

        uint256 spread = startPrice - reservePrice;
        uint256 decay = Math.mulDiv(spread, elapsed, AUCTION_DURATION);
        uint256 price = startPrice - decay;

        return price < reservePrice ? reservePrice : price;
    }

    function requiredEthAtPrice(uint256 price) public view returns (uint256) {
        return Math.mulDiv(saleSupply, price, TOKEN_SCALE, Math.Rounding.Ceil);
    }

    function settlementOf(
        address account
    )
        public
        view
        returns (
            uint256 commitment,
            uint256 tokens,
            uint256 acceptedEth,
            uint256 refund,
            bool isFinal
        )
    {
        commitment = commitments[account];
        if (commitment == 0) {
            return (0, 0, 0, 0, finalized);
        }

        if (finalized) {
            (tokens, acceptedEth, refund) = _finalSettlement(commitment);
            return (commitment, tokens, acceptedEth, refund, true);
        }

        uint256 quotePrice = clearingTime != 0 ? clearingPrice : priceAt(block.timestamp);
        if (totalCommitted >= requiredEthAtPrice(quotePrice)) {
            tokens = Math.mulDiv(commitment, saleSupply, totalCommitted);
        } else {
            tokens = Math.mulDiv(commitment, TOKEN_SCALE, quotePrice);
            if (tokens > saleSupply) {
                tokens = saleSupply;
            }
        }

        acceptedEth = _acceptedCost(tokens, quotePrice);
        if (acceptedEth > commitment) {
            acceptedEth = commitment;
        }
        refund = commitment - acceptedEth;
        return (commitment, tokens, acceptedEth, refund, false);
    }

    function _contribute(address account, uint256 amount) private {
        if (!started) {
            revert AuctionNotStarted();
        }
        if (amount == 0) {
            revert ZeroContribution();
        }
        if (finalized || block.timestamp >= endTime()) {
            revert AuctionClosed();
        }

        _syncTimeClearing(block.timestamp);
        if (clearingTime != 0) {
            revert AuctionAlreadyCleared();
        }

        if (!participantRegistered[account]) {
            participantRegistered[account] = true;
            participantCount += 1;
        }

        commitments[account] += amount;
        totalCommitted += amount;

        uint256 price = priceAt(block.timestamp);
        if (totalCommitted >= requiredEthAtPrice(price)) {
            clearingTime = block.timestamp;
            clearingPrice = price;
            emit AuctionCleared(clearingTime, clearingPrice, totalCommitted);
        } else {
            lastCommitmentTimestamp = block.timestamp;
        }

        emit ContributionReceived(account, amount, totalCommitted);
    }

    function _syncTimeClearing(uint256 timestamp) private {
        if (!started || clearingTime != 0 || totalCommitted == 0) {
            return;
        }

        uint256 cappedTimestamp = timestamp > endTime() ? endTime() : timestamp;
        uint256 affordablePrice = Math.mulDiv(totalCommitted, TOKEN_SCALE, saleSupply);
        if (affordablePrice < reservePrice) {
            return;
        }

        uint256 earliest = _earliestClearingTime(affordablePrice);
        if (earliest < lastCommitmentTimestamp) {
            earliest = lastCommitmentTimestamp;
        }

        if (earliest <= cappedTimestamp) {
            clearingTime = earliest;
            clearingPrice = priceAt(earliest);
            emit AuctionCleared(clearingTime, clearingPrice, totalCommitted);
        }
    }

    function _earliestClearingTime(uint256 affordablePrice) private view returns (uint256) {
        if (affordablePrice >= startPrice) {
            return startTime;
        }
        if (affordablePrice < reservePrice) {
            return type(uint256).max;
        }

        uint256 spread = startPrice - reservePrice;
        uint256 dropNeeded = startPrice - affordablePrice;
        uint256 elapsed = Math.mulDiv(dropNeeded, AUCTION_DURATION, spread, Math.Rounding.Ceil);
        if (elapsed > AUCTION_DURATION) {
            elapsed = AUCTION_DURATION;
        }

        return startTime + elapsed;
    }

    function _settleAccount(address account) private {
        if (!finalized) {
            revert AuctionNotFinalizable(endTime());
        }

        uint256 commitment = commitments[account];
        if (commitment == 0) {
            revert NoCommitment();
        }
        if (settled[account]) {
            revert AlreadySettled();
        }

        (uint256 tokens, uint256 acceptedEth, uint256 refund) = _finalSettlement(commitment);

        settled[account] = true;
        settledParticipantCount += 1;
        tokensClaimedByAccount[account] = tokens;
        acceptedEthByAccount[account] = acceptedEth;
        refundCredits[account] = refund;
        refundLiability += refund;
        issuerProceedsAvailable += acceptedEth;
        totalTokensClaimed += tokens;

        emit AccountSettled(account, tokens, acceptedEth, refund);

        if (tokens != 0) {
            token.safeTransfer(account, tokens);
        }
    }

    function _finalSettlement(
        uint256 commitment
    ) private view returns (uint256 tokens, uint256 acceptedEth, uint256 refund) {
        if (cleared) {
            tokens = Math.mulDiv(commitment, saleSupply, totalCommitted);
        } else {
            tokens = Math.mulDiv(commitment, TOKEN_SCALE, finalPrice);
        }

        acceptedEth = _acceptedCost(tokens, finalPrice);
        if (acceptedEth > commitment) {
            acceptedEth = commitment;
        }
        refund = commitment - acceptedEth;
    }

    function _acceptedCost(uint256 tokens, uint256 price) private pure returns (uint256) {
        if (tokens == 0) {
            return 0;
        }
        return Math.mulDiv(tokens, price, TOKEN_SCALE, Math.Rounding.Ceil);
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

