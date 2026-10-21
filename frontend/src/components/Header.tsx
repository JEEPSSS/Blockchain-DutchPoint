import { Wallet } from "../hooks/useWallet";
import { chainName } from "../lib/contracts";
import { shortAddress } from "../lib/format";

type Props = {
  wallet: Wallet;
  supported: boolean;
};

export function Header({ wallet, supported }: Props) {
  return (
    <header className="topbar">
      <div className="brand">
        <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
          <rect x="3" y="5" width="6" height="22" rx="2" />
          <rect x="13" y="11" width="6" height="16" rx="2" />
          <rect x="23" y="17" width="6" height="10" rx="2" />
        </svg>
        <div>
          <strong>DutchPoint</strong>
          <span>Falling prices. One clearing price.</span>
        </div>
      </div>

      <div className="wallet">
        {wallet.chainId !== null && wallet.account && (
          <span className={`network-badge ${supported ? "ok" : "warn"}`}>
            <span className="dot" aria-hidden="true" />
            {chainName(wallet.chainId)}
          </span>
        )}
        {wallet.account ? (
          <span className="account-chip" title={wallet.account}>
            {shortAddress(wallet.account)}
          </span>
        ) : (
          <button className="btn primary" onClick={wallet.connect} disabled={wallet.connecting}>
            {wallet.connecting ? "Connecting…" : "Connect wallet"}
          </button>
        )}
      </div>
    </header>
  );
}
