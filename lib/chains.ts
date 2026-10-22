import { createPublicClient, http, type Chain, type PublicClient } from "viem";
import { mainnet, sepolia } from "viem/chains";

export const SUPPORTED_CHAINS: Chain[] = [mainnet, sepolia];
export type ChainId = 1 | 11155111;

export const chainById = (id: number): Chain | undefined => SUPPORTED_CHAINS.find((c) => c.id === id);
export const isSupported = (id: number | undefined): id is ChainId => id === 1 || id === 11155111;

/** Browser-friendly public endpoints (CORS enabled). Rate-limited: users should set their own in Settings. */
const DEFAULT_RPC: Record<number, string> = {
  1: "https://ethereum-rpc.publicnode.com",
  11155111: "https://ethereum-sepolia-rpc.publicnode.com",
};

const cache = new Map<string, PublicClient>();

/** One shared read client per chain + RPC URL. */
export function publicClientFor(chainId: number, rpcUrl?: string): PublicClient {
  const chain = chainById(chainId);
  if (!chain) throw new Error(`Unsupported chain ${chainId}`);
  const key = `${chainId}|${rpcUrl ?? ""}`;
  let c = cache.get(key);
  if (!c) {
    c = createPublicClient({ chain, transport: http(rpcUrl || DEFAULT_RPC[chainId], { retryCount: 1, timeout: 12_000 }) }) as PublicClient;
    cache.set(key, c);
  }
  return c;
}

export const explorerTx = (chainId: number, hash: string) =>
  `${chainById(chainId)?.blockExplorers?.default.url ?? "https://etherscan.io"}/tx/${hash}`;
export const explorerAddr = (chainId: number, addr: string) =>
  `${chainById(chainId)?.blockExplorers?.default.url ?? "https://etherscan.io"}/address/${addr}`;
