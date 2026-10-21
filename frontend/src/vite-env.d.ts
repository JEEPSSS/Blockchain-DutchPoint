/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEFAULT_CHAIN_ID?: string;
  readonly VITE_READ_RPC_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

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
