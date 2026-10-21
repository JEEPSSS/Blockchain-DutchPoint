const STEPS = [
  {
    title: "The price falls",
    body: "Gavora opens at a deliberately high price that drops in a straight line to the reserve price over exactly 20 minutes. There's no rush to bid first."
  },
  {
    title: "Bids pile up",
    body: "You commit ETH whenever the price looks fair. As the price keeps falling, the same ETH buys more GVRA. The moment committed ETH can buy the whole supply, the auction sells out."
  },
  {
    title: "Everyone pays one price",
    body: "Every winner pays the same clearing price, however early they bid. The bid that sells out the auction only buys what's left; its surplus ETH is refunded instantly. Unsold GVRA is burned."
  }
];

export function HowItWorks() {
  return (
    <section className="how" aria-labelledby="how-title">
      <h2 id="how-title">How a DutchPoint auction works</h2>
      <ol>
        {STEPS.map((step, index) => (
          <li key={step.title}>
            <span className="step">{index + 1}</span>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
