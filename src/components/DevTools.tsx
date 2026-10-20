import { JsonRpcProvider } from "ethers";
import { useState } from "react";

import { LOCAL_CHAIN_ID, LOCAL_RPC_URL } from "../lib/contracts";
import { describeError } from "../lib/errors";

type Props = {
  onAdvanced: () => Promise<void>;
};

/** Local-chain only: fast-forward the Hardhat clock so a demo doesn't wait 20 real minutes. */
export function DevTools({ onAdvanced }: Props) {
  const [message, setMessage] = useState("");

  const advance = async (seconds: number) => {
    const local = new JsonRpcProvider(LOCAL_RPC_URL, LOCAL_CHAIN_ID, { staticNetwork: true });
    try {
      await local.send("evm_increaseTime", [seconds]);
      await local.send("evm_mine", []);
      setMessage(`Moved the local chain clock forward ${seconds / 60} min.`);
      await onAdvanced();
    } catch (err) {
      setMessage(describeError(err));
    } finally {
      local.destroy();
    }
  };

  return (
    <section className="card devtools">
      <h2>Local demo tools</h2>
      <p className="muted">Fast-forward the Hardhat node's clock. Only shown on the local chain.</p>
      <div className="chips">
        {[1, 5, 10, 20].map((minutes) => (
          <button key={minutes} className="chip" onClick={() => void advance(minutes * 60)}>
            +{minutes} min
          </button>
        ))}
      </div>
      {message && <p className="hint">{message}</p>}
    </section>
  );
}
