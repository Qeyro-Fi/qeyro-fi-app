import type { Address, PublicClient } from "viem";
import { erc7579AccountAbi, moduleAbi } from "../abi/erc7579";
import { HOOKS, type HookDef } from "./hookCatalog";
import { addressFor, type Settings } from "./settings";
import { useAsync, useClient } from "./chainData";
import { useWallet } from "./wallet";

export interface HookStatus {
  def: HookDef;
  address?: Address;
  deployed: boolean;
  installed: boolean;
  config?: any;
}

export interface AccountStatus {
  address: Address;
  kind: "eoa" | "contract";
  accountId?: string;
  supportsHook?: boolean;
  supportsExecutor?: boolean;
  hooks: HookStatus[];
  ethBalance: bigint;
}

async function tryRead<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch {
    return undefined;
  }
}

export async function readAccount(client: PublicClient, settings: Settings, chainId: number, address: Address): Promise<AccountStatus> {
  const [code, ethBalance] = await Promise.all([client.getCode({ address }), client.getBalance({ address })]);
  const kind = code && code !== "0x" ? "contract" : "eoa";
  let accountId: string | undefined, supportsHook: boolean | undefined, supportsExecutor: boolean | undefined;
  if (kind === "contract") {
    [accountId, supportsHook, supportsExecutor] = await Promise.all([
      tryRead(() => client.readContract({ address, abi: erc7579AccountAbi, functionName: "accountId" })),
      tryRead(() => client.readContract({ address, abi: erc7579AccountAbi, functionName: "supportsModule", args: [4n] })),
      tryRead(() => client.readContract({ address, abi: erc7579AccountAbi, functionName: "supportsModule", args: [2n] })),
    ]);
  }
  const hooks: HookStatus[] = await Promise.all(
    HOOKS.map(async (def) => {
      const mod = addressFor(settings, chainId, def.contract);
      if (!mod) return { def, address: undefined, deployed: false, installed: false };
      const modCode = await tryRead(() => client.getCode({ address: mod }));
      if (!modCode || modCode === "0x") return { def, address: mod, deployed: false, installed: false };
      const installed = (await tryRead(() => client.readContract({ address: mod, abi: moduleAbi, functionName: "isInitialized", args: [address] }))) ?? false;
      const config = installed
        ? await tryRead(() => client.readContract({ address: mod, abi: def.abi as any, functionName: def.configGetter as any, args: [address] } as any))
        : undefined;
      return { def, address: mod, deployed: true, installed, config };
    }),
  );
  return { address, kind, accountId, supportsHook, supportsExecutor, hooks, ethBalance };
}

/** Status of the connected account on the selected network. Idle (never resolves) when disconnected. */
export function useAccountStatus() {
  const { client, chainId, settings } = useClient();
  const { account } = useWallet();
  const r = useAsync(
    async () => {
      if (!account) throw new Error("DISCONNECTED");
      return readAccount(client, settings, chainId, account);
    },
    [client, chainId, settings.deployments, account],
    45_000,
  );
  return { ...r, account };
}
