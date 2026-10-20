import { BrowserProvider, Eip1193Provider, getAddress } from "ethers";
import { useCallback, useEffect, useState } from "react";

import { LOCAL_CHAIN_ID, LOCAL_RPC_URL, chainName } from "../lib/contracts";
import { describeError } from "../lib/errors";

export type Wallet = {
  available: boolean;
  provider: BrowserProvider | null;
  account: string | null;
  chainId: number | null;
  connecting: boolean;
  error: string;
  connect: () => Promise<void>;
  switchChain: (chainId: number) => Promise<void>;
};

export function useWallet(): Wallet {
  const ethereum = window.ethereum;
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  const sync = useCallback(async () => {
    if (!ethereum) {
      return;
    }
    const accounts = (await ethereum.request({ method: "eth_accounts" })) as string[];
    const hexChainId = (await ethereum.request({ method: "eth_chainId" })) as string;
    setChainId(Number(hexChainId));
    if (accounts.length === 0) {
      setAccount(null);
      setProvider(null);
      return;
    }
    // ethers pins a BrowserProvider to the network it first sees, so build a fresh one
    // whenever the account or chain changes.
    setProvider(new BrowserProvider(ethereum as Eip1193Provider));
    setAccount(getAddress(accounts[0]));
  }, [ethereum]);

  useEffect(() => {
    if (!ethereum) {
      return;
    }
    // Restores a connection the user already approved, without a wallet prompt.
    void sync();
    const handler = () => {
      void sync();
    };
    ethereum.on?.("accountsChanged", handler);
    ethereum.on?.("chainChanged", handler);
    return () => {
      ethereum.removeListener?.("accountsChanged", handler);
      ethereum.removeListener?.("chainChanged", handler);
    };
  }, [ethereum, sync]);

  const connect = useCallback(async () => {
    if (!ethereum) {
      setError("Install MetaMask or another browser wallet to bid on DutchPoint.");
      return;
    }
    setError("");
    setConnecting(true);
    try {
      await ethereum.request({ method: "eth_requestAccounts" });
      await sync();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setConnecting(false);
    }
  }, [ethereum, sync]);

  const switchChain = useCallback(
    async (target: number) => {
      if (!ethereum) {
        return;
      }
      const hexChainId = `0x${target.toString(16)}`;
      setError("");
      try {
        await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexChainId }] });
      } catch (err) {
        // 4902: the wallet doesn't know this chain yet. Offer to add the local Hardhat node.
        if ((err as { code?: number }).code === 4902 && target === LOCAL_CHAIN_ID) {
          try {
            await ethereum.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: hexChainId,
                  chainName: chainName(target),
                  rpcUrls: [LOCAL_RPC_URL],
                  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }
                }
              ]
            });
          } catch (addErr) {
            setError(describeError(addErr));
          }
        } else {
          setError(describeError(err));
        }
      }
    },
    [ethereum]
  );

  return {
    available: Boolean(ethereum),
    provider,
    account,
    chainId,
    connecting,
    error,
    connect,
    switchChain
  };
}
