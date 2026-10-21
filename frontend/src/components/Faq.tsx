const QUESTIONS = [
  {
    question: "Why can I end up with more GVRA than the quote showed?",
    answer:
      "You commit ETH, not a number of tokens. Everyone pays the final clearing price, which can only be at or below the price when you bid, so your ETH buys at least the quoted amount and often more."
  },
  {
    question: "What happens if the auction doesn't sell out?",
    answer:
      "When the 20 minutes end, everyone pays the reserve price and receives GVRA for all the ETH they committed. The unsold GVRA is burned, which permanently lowers the total supply."
  },
  {
    question: "What if I send more ETH than it takes to sell out?",
    answer:
      "Only the ETH needed to buy the remaining GVRA is accepted. The rest comes straight back in the same transaction. If your wallet is a contract that refuses ETH, the refund is held for you to withdraw."
  },
  {
    question: "When can I claim my GVRA?",
    answer:
      "Once the 20-minute window has ended and anyone has finalized the auction. There is no deadline: unclaimed GVRA stays reserved for you."
  },
  {
    question: "Who can withdraw the ETH that was raised?",
    answer:
      "Only the issuer, and only after finalization. Refunds are tracked separately, so they can never be paid out as proceeds."
  },
  {
    question: "Is this real money?",
    answer:
      "No. DutchPoint runs on a local test chain or the Sepolia testnet, where ETH has no value. Never send real funds to the public test accounts used in demos."
  }
];

export function Faq() {
  return (
    <section className="faq" aria-labelledby="faq-title">
      <h2 id="faq-title">Questions</h2>
      <div className="faq-list">
        {QUESTIONS.map((item) => (
          <details key={item.question}>
            <summary>{item.question}</summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
