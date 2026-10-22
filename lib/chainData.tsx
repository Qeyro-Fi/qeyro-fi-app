import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseAbiItem, type Address, type Hex, type PublicClient } from "viem";
import { publicClientFor } from "./chains";
import { threatOracleAbi } from "../abi/generated";
import { addressFor, activeChainId, deploymentFor, useSettings, type Settings } from "./settings";
import { errMsg } from "./format";
import type { ContractKey } from "./deployments";

export type Load<T> =
  | { status: "loading" }
  | { status: "not-deployed" }
  | { status: "no-code"; address: Address }
  | { status: "error"; error: string }
  | { status: "ready"; data: T };

export function useClient(): { client: PublicClient; chainId: number; settings: Settings } {
  const settings = useSettings();
  const chainId = activeChainId(settings);
  const client = useMemo(() => publicClientFor(chainId, settings.rpcUrls[chainId]), [chainId, settings.rpcUrls]);
  return { client, chainId, settings };
}

/** Run an async loader, re-run on deps change, expose a manual refresh. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], intervalMs?: number): { state: Load<T>; refresh: () => void } {
  const [state, setState] = useState<Load<T>>({ status: "loading" });
  const seq = useRef(0);
  const run = useCallback(async () => {
    const my = ++seq.current;
    try {
      const data = await fn();
      if (my === seq.current) setState({ status: "ready", data });
    } catch (e) {
      if (my === seq.current) {
        const msg = errMsg(e);
        setState(msg === "NOT_DEPLOYED" ? { status: "not-deployed" } : msg.startsWith("NO_CODE:") ? { status: "no-code", address: msg.slice(8) as Address } : { status: "error", error: msg });
      }
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setState({ status: "loading" });
    run();
    if (!intervalMs) return;
    const t = setInterval(run, intervalMs);
    return () => clearInterval(t);
  }, [run, intervalMs]);
  return { state, refresh: run };
}

/** Resolve a deployed contract address or throw a sentinel the UI renders as "Not Deployed". */
export async function requireContract(client: PublicClient, settings: Settings, chainId: number, key: ContractKey): Promise<Address> {
  const addr = addressFor(settings, chainId, key);
  if (!addr) throw new Error("NOT_DEPLOYED");
  const code = await client.getCode({ address: addr });
  if (!code || code === "0x") throw new Error(`NO_CODE:${addr}`);
  return addr;
}

export interface OracleData {
  address: Address;
  level: number;
  lastUpdate: number;
  maxAge: number;
  fresh: boolean;
  threshold: number;
  attesters: number;
  downgradeCooldown: number;
  evidenceHash: Hex;
  sourceURI: string;
  proposals: number;
  blockTimestamp: number;
}

export async function readOracle(client: PublicClient, settings: Settings, chainId: number): Promise<OracleData> {
  const address = await requireContract(client, settings, chainId, "threatOracle");
  const c = { address, abi: threatOracleAbi } as const;
  const [level, lastUpdate, maxAge, threshold, attesters, cooldown, evidenceHash, sourceURI, proposals, fresh, block] = await Promise.all([
    client.readContract({ ...c, functionName: "threatLevel" }),
    client.readContract({ ...c, functionName: "lastUpdate" }),
    client.readContract({ ...c, functionName: "maxAge" }),
    client.readContract({ ...c, functionName: "threshold" }),
    client.readContract({ ...c, functionName: "attesterCount" }),
    client.readContract({ ...c, functionName: "downgradeCooldown" }),
    client.readContract({ ...c, functionName: "evidenceHash" }),
    client.readContract({ ...c, functionName: "sourceURI" }),
    client.readContract({ ...c, functionName: "proposalCount" }),
    client.readContract({ ...c, functionName: "isFresh" }),
    client.getBlock(),
  ]);
  return {
    address,
    level: Number(level),
    lastUpdate: Number(lastUpdate),
    maxAge: Number(maxAge),
    fresh,
    threshold: Number(threshold),
    attesters: Number(attesters),
    downgradeCooldown: Number(cooldown),
    evidenceHash,
    sourceURI,
    proposals: Number(proposals),
    blockTimestamp: Number(block.timestamp),
  };
}

export function useOracle(intervalMs = 30_000) {
  const { client, chainId, settings } = useClient();
  return useAsync(() => readOracle(client, settings, chainId), [client, chainId, settings.deployments], intervalMs);
}

// ------------------------------------------------------------------ events

export interface ChainEvent {
  key: string;
  block: bigint;
  logIndex: number;
  hash: Hex;
  kind: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  origin: string;
  affected: string;
  summary: string;
  response: string;
  timestamp?: number;
}

const evUpdated = parseAbiItem("event ThreatLevelUpdated(uint8 indexed previousLevel, uint8 indexed newLevel, uint256 indexed proposalId, bytes32 evidenceHash, string sourceURI)");
const evProposal = parseAbiItem("event ProposalCreated(uint256 indexed id, address indexed proposer, uint8 level, bytes32 evidenceHash, string sourceURI)");
const evFlag = parseAbiItem("event ProtocolFlagged(address indexed protocol, uint8 severity, bytes32 evidenceHash, address indexed reporter)");
const evPaused = parseAbiItem("event Paused(address indexed account, address indexed by, bool automatic)");

const sevOfLevel = (l: number): ChainEvent["severity"] => (l >= 5 ? "critical" : l >= 4 ? "high" : l >= 3 ? "medium" : l >= 1 ? "low" : "info");
const LOOKBACK = 9_000n;

async function fromBlockFor(client: PublicClient, settings: Settings, chainId: number): Promise<bigint> {
  const fb = deploymentFor(settings, chainId).fromBlock;
  if (fb && /^\d+$/.test(fb)) return BigInt(fb);
  const head = await client.getBlockNumber();
  return head > LOOKBACK ? head - LOOKBACK : 0n;
}

/** Real events from the configured contracts. Returns [] when nothing is deployed or nothing happened. */
export async function readEvents(client: PublicClient, settings: Settings, chainId: number, account?: Address): Promise<ChainEvent[]> {
  const dep = deploymentFor(settings, chainId);
  if (!dep.threatOracle && !dep.deFiRiskHook && !dep.emergencyPause) return [];
  const fromBlock = await fromBlockFor(client, settings, chainId);
  const out: ChainEvent[] = [];

  if (dep.threatOracle) {
    const [updated, proposals] = await Promise.all([
      client.getLogs({ address: dep.threatOracle, event: evUpdated, fromBlock }),
      client.getLogs({ address: dep.threatOracle, event: evProposal, fromBlock }),
    ]);
    for (const l of updated) {
      const nl = Number(l.args.newLevel), pl = Number(l.args.previousLevel);
      out.push({
        key: `${l.transactionHash}-${l.logIndex}`, block: l.blockNumber, logIndex: l.logIndex, hash: l.transactionHash,
        kind: nl === pl ? "Oracle refresh" : nl > pl ? "Threat level raised" : "Threat level lowered",
        severity: sevOfLevel(nl), origin: "ThreatOracle", affected: "All integrations reading this oracle",
        summary: nl === pl ? `Level ${nl} re-confirmed` : `Level ${pl} → ${nl}`, response: `Attested (proposal #${l.args.proposalId})`,
      });
    }
    for (const l of proposals) {
      out.push({
        key: `${l.transactionHash}-${l.logIndex}`, block: l.blockNumber, logIndex: l.logIndex, hash: l.transactionHash,
        kind: "Oracle proposal", severity: "info", origin: "ThreatOracle attester", affected: "ThreatOracle",
        summary: `Proposal #${l.args.id}: level ${l.args.level}`, response: "Awaiting threshold attestations",
      });
    }
  }
  if (dep.deFiRiskHook) {
    const flags = await client.getLogs({ address: dep.deFiRiskHook, event: evFlag, fromBlock });
    for (const l of flags) {
      const sev = Number(l.args.severity);
      out.push({
        key: `${l.transactionHash}-${l.logIndex}`, block: l.blockNumber, logIndex: l.logIndex, hash: l.transactionHash,
        kind: sev === 0 ? "Protocol flag cleared" : "Protocol flagged", severity: sev === 0 ? "info" : sevOfLevel(sev),
        origin: "DeFiRiskHook reporter", affected: l.args.protocol ?? "—", summary: `Severity ${sev}`,
        response: sev === 0 ? "Restrictions lifted" : "Account policies apply on next call",
      });
    }
  }
  if (dep.emergencyPause && account) {
    const pauses = await client.getLogs({ address: dep.emergencyPause, event: evPaused, args: { account }, fromBlock });
    for (const l of pauses) {
      out.push({
        key: `${l.transactionHash}-${l.logIndex}`, block: l.blockNumber, logIndex: l.logIndex, hash: l.transactionHash,
        kind: l.args.automatic ? "Automatic pause latched" : "Guardian pause", severity: "high",
        origin: l.args.by ?? "—", affected: account, summary: "Protected operations paused", response: "Paused until time-locked unpause",
      });
    }
  }

  out.sort((a, b) => (a.block === b.block ? b.logIndex - a.logIndex : a.block < b.block ? 1 : -1));
  const top = out.slice(0, 60);
  const blocks = [...new Set(top.map((e) => e.block))];
  const stamps = new Map<bigint, number>();
  await Promise.all(blocks.map(async (b) => stamps.set(b, Number((await client.getBlock({ blockNumber: b })).timestamp))));
  return top.map((e) => ({ ...e, timestamp: stamps.get(e.block) }));
}

export function useEvents(account?: Address) {
  const { client, chainId, settings } = useClient();
  return useAsync(() => readEvents(client, settings, chainId, account), [client, chainId, settings.deployments, account], 60_000);
}

export async function accountKind(client: PublicClient, account: Address): Promise<"eoa" | "contract"> {
  const code = await client.getCode({ address: account });
  return code && code !== "0x" ? "contract" : "eoa";
}
