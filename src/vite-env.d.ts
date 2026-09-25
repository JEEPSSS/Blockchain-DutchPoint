/// <reference types="vite/client" />

interface EthereumProviderLike {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: "accountsChanged" | "chainChanged", handler: (...args: unknown[]) => void): void;
  removeListener?(
    event: "accountsChanged" | "chainChanged",
    handler: (...args: unknown[]) => void
  ): void;
}

interface Window {
  ethereum?: EthereumProviderLike;
}

