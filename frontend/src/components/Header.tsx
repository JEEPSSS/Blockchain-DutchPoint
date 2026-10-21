import { ThemeChoice } from "../hooks/useTheme";
import { Wallet } from "../hooks/useWallet";
import { chainName } from "../lib/contracts";
import { shortAddress } from "../lib/format";

type Props = {
  wallet: Wallet;
  supported: boolean;
  theme: ThemeChoice;
  onCycleTheme: () => void;
};

const THEME_LABELS: Record<ThemeChoice, { icon: string; label: string }> = {
  system: { icon: "◐", label: "Auto" },
  light: { icon: "☀", label: "Light" },
  dark: { icon: "☾", label: "Dark" }
};

export function Header({ wallet, supported, theme, onCycleTheme }: Props) {
  const themeLabel = THEME_LABELS[theme];

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
        <button
          className="theme-toggle"
          onClick={onCycleTheme}
          title="Switch between automatic, light and dark themes"
          aria-label={`Theme: ${themeLabel.label}. Click to change.`}
        >
          <span aria-hidden="true">{themeLabel.icon}</span>
          {themeLabel.label}
        </button>
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
