import { encodeAbiParameters, isAddress, parseEther, formatEther, type Address, type Hex } from "viem";
import { deFiRiskHookAbi, emergencyPauseAbi, quantumThreatHookAbi, recoveryModuleAbi, transactionLimitHookAbi } from "../abi/generated";
import type { ContractKey } from "./deployments";
import { LEVELS } from "./format";

export type Values = Record<string, string | boolean>;
export type FieldDef =
  | { id: string; label: string; kind: "number" | "text" | "address" | "eth" | "addresses"; hint?: string; placeholder?: string }
  | { id: string; label: string; kind: "select"; options: [string, string][]; hint?: string }
  | { id: string; label: string; kind: "check"; hint?: string };

export interface HookDef {
  id: "quantum" | "txlimit" | "pause" | "defi" | "recovery";
  contract: ContractKey;
  moduleType: 2 | 4;
  name: string;
  tagline: string;
  description: string;
  trigger: string;
  action: string;
  compat: string;
  abi: readonly unknown[];
  configGetter: string;
  fields: FieldDef[];
  defaults: (d: { threshold: number; failClosed: boolean; ttl: number }) => Values;
  encode(v: Values): Hex;
  describe(cfg: any): [string, string][];
}

const lvl = (v: unknown, name: string): number => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 5) throw new Error(`${name} must be an integer 0–5`);
  return n;
};
const uint = (v: unknown, name: string, max = 2 ** 32 - 1): number => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > max) throw new Error(`${name} must be a non-negative integer`);
  return n;
};
const eth = (v: unknown, name: string): bigint => {
  const s = String(v ?? "").trim();
  if (s === "") return 0n;
  try {
    return parseEther(s);
  } catch {
    throw new Error(`${name} must be a number of ETH`);
  }
};
const addr = (v: unknown, name: string, optional = false): Address => {
  const s = String(v ?? "").trim();
  if (!s && optional) return "0x0000000000000000000000000000000000000000";
  if (!isAddress(s)) throw new Error(`${name} must be a valid address`);
  return s as Address;
};
const addrList = (v: unknown, name: string): Address[] => {
  const parts = String(v ?? "").split(/[\s,;]+/).filter(Boolean);
  if (!parts.length) throw new Error(`${name} needs at least one address`);
  return parts.map((p) => addr(p, name));
};

const lvlOptions = (zero: boolean): [string, string][] =>
  LEVELS.filter((l) => zero || l.level > 0).map((l) => [String(l.level), `${l.level} — ${l.name}`]);

export const HOOKS: HookDef[] = [
  {
    id: "quantum",
    contract: "quantumThreatHook",
    moduleType: 4,
    name: "Quantum Threat Hook",
    tagline: "React when the verified threat level reaches your threshold.",
    description: "Reads the Threat Oracle on every protected call. Below your threshold it is invisible; at or above it, it restricts operations according to the mode you choose.",
    trigger: "Verified oracle level ≥ your threshold (optionally: oracle data is stale)",
    action: "Block all calls · block value and token moves · or require a single-use approval from an approver",
    compat: "ERC-7579 account with hook support (module type 4)",
    abi: quantumThreatHookAbi,
    configGetter: "configOf",
    fields: [
      { id: "threshold", label: "Trigger level", kind: "select", options: lvlOptions(false), hint: "Hook activates when the oracle reaches this level." },
      { id: "mode", label: "Protection action", kind: "select", options: [["0", "Block all calls"], ["1", "Block value & token moves"], ["2", "Require approval for every call"]] },
      { id: "failClosed", label: "Treat a stale oracle as a threat", kind: "check", hint: "Safer, but blocks you if attesters stop publishing." },
      { id: "approver", label: "Approver address", kind: "address", hint: "Required for the approval mode. A separate key or multisig." },
      { id: "ttl", label: "Approval validity (seconds)", kind: "number" },
    ],
    defaults: (d) => ({ threshold: String(d.threshold), mode: "1", failClosed: d.failClosed, approver: "", ttl: String(d.ttl) }),
    encode: (v) => {
      const mode = uint(v.mode, "Mode", 2);
      const threshold = lvl(v.threshold, "Trigger level");
      if (threshold < 1) throw new Error("Trigger level must be 1–5");
      const approver = addr(v.approver, "Approver", mode !== 2);
      const ttl = uint(v.ttl, "Approval validity");
      if (mode === 2 && ttl === 0) throw new Error("Approval validity must be above 0");
      return encodeAbiParameters(
        [{ type: "tuple", components: [{ type: "uint8" }, { type: "uint8" }, { type: "bool" }, { type: "address" }, { type: "uint32" }] }],
        [[threshold, mode, Boolean(v.failClosed), approver, ttl]],
      );
    },
    describe: (c) => [
      ["Trigger level", `L${c.threshold} ${LEVELS[c.threshold]?.name ?? ""}`],
      ["Action", ["Block all calls", "Block value & token moves", "Require approval"][c.mode]],
      ["Stale oracle", c.failClosed ? "treated as threat" : "ignored"],
      ["Approver", c.approver],
    ],
  },
  {
    id: "txlimit",
    contract: "transactionLimitHook",
    moduleType: 4,
    name: "Transaction Limit Hook",
    tagline: "Hard limits and destination rules for native value.",
    description: "Caps single transactions and rolling-day totals, applies allow/block destination lists (including ERC-20 recipients and spenders) and can require approval above a size.",
    trigger: "Any protected call that breaks a configured limit or list",
    action: "Revert the call, or require a single-use approval above the approval size",
    compat: "ERC-7579 account with hook support (module type 4). ERC-20 amounts are not limited.",
    abi: transactionLimitHookAbi,
    configGetter: "configOf",
    fields: [
      { id: "max", label: "Max per transaction (ETH)", kind: "eth", hint: "0 = no limit" },
      { id: "daily", label: "Daily limit (ETH, UTC day)", kind: "eth", hint: "0 = no limit" },
      { id: "above", label: "Approval required above (ETH)", kind: "eth", hint: "0 = never" },
      { id: "allowOnly", label: "Only allow listed destinations", kind: "check" },
      { id: "approver", label: "Approver address", kind: "address", hint: "Required if an approval size is set." },
      { id: "ttl", label: "Approval validity (seconds)", kind: "number" },
    ],
    defaults: (d) => ({ max: "", daily: "", above: "", allowOnly: false, approver: "", ttl: String(d.ttl) }),
    encode: (v) => {
      const max = eth(v.max, "Max per transaction");
      const daily = eth(v.daily, "Daily limit");
      const above = eth(v.above, "Approval size");
      if (max && daily && max > daily) throw new Error("Max per transaction cannot exceed the daily limit");
      const approver = addr(v.approver, "Approver", above === 0n);
      const ttl = uint(v.ttl, "Approval validity");
      if (above !== 0n && ttl === 0) throw new Error("Approval validity must be above 0");
      return encodeAbiParameters(
        [{ type: "tuple", components: [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "bool" }, { type: "address" }, { type: "uint32" }] }],
        [[max, daily, above, Boolean(v.allowOnly), approver, ttl]],
      );
    },
    describe: (c) => [
      ["Max / tx", c.maxPerTx ? `${formatEther(c.maxPerTx)} ETH` : "none"],
      ["Daily limit", c.dailyLimit ? `${formatEther(c.dailyLimit)} ETH` : "none"],
      ["Approval above", c.approvalAbove ? `${formatEther(c.approvalAbove)} ETH` : "off"],
      ["Allowlist only", c.allowlistOnly ? "yes" : "no"],
    ],
  },
  {
    id: "pause",
    contract: "emergencyPause",
    moduleType: 4,
    name: "Emergency Pause",
    tagline: "Pause protected operations during a critical event.",
    description: "Guardians can pause the account, and the oracle can pause it automatically at a level you choose. Unpausing is initiated by the account, time-locked, and refused while the oracle is still at the pause level.",
    trigger: "Guardian pause, or verified oracle level ≥ auto-pause level",
    action: "Block all operations (or only value and token moves) until a time-locked unpause",
    compat: "ERC-7579 account with hook support (module type 4)",
    abi: emergencyPauseAbi,
    configGetter: "stateOf",
    fields: [
      { id: "guardians", label: "Guardian addresses", kind: "addresses", hint: "Comma or space separated. They can pause but never move funds.", placeholder: "0x…, 0x…" },
      { id: "auto", label: "Automatic pause level", kind: "select", options: lvlOptions(true), hint: "0 = the oracle never pauses automatically." },
      { id: "delay", label: "Unpause delay (seconds)", kind: "number" },
      { id: "valueOnly", label: "Pause only value and token moves", kind: "check", hint: "Off pauses everything except calls to this module." },
    ],
    defaults: () => ({ guardians: "", auto: "4", delay: "86400", valueOnly: false }),
    encode: (v) => {
      const delay = uint(v.delay, "Unpause delay");
      if (delay === 0) throw new Error("Unpause delay must be above 0");
      return encodeAbiParameters(
        [{ type: "tuple", components: [{ type: "address[]" }, { type: "uint8" }, { type: "uint32" }, { type: "bool" }] }],
        [[addrList(v.guardians, "Guardians"), lvl(v.auto, "Automatic pause level"), delay, Boolean(v.valueOnly)]],
      );
    },
    describe: (c) => [
      ["State", c.paused ? "PAUSED" : "active"],
      ["Auto-pause level", c.autoPauseLevel ? `L${c.autoPauseLevel}` : "off"],
      ["Unpause delay", `${c.unpauseDelay}s`],
      ["Scope", c.valueOnly ? "value & token moves" : "all operations"],
    ],
  },
  {
    id: "defi",
    contract: "deFiRiskHook",
    moduleType: 4,
    name: "DeFi Risk Hook",
    tagline: "Policies for protocols flagged by authorised reporters.",
    description: "Authorised reporters flag protocol addresses on-chain with an evidence hash and severity. Your account blocks, or asks for approval, when a call touches a flagged protocol. With no flags nothing is restricted.",
    trigger: "Call (or ERC-20 recipient/spender) targets a protocol flagged at or above your severity",
    action: "Revert the call, or require a single-use approval",
    compat: "ERC-7579 account with hook support (module type 4)",
    abi: deFiRiskHookAbi,
    configGetter: "configOf",
    fields: [
      { id: "block", label: "Block at severity ≥", kind: "select", options: lvlOptions(true).map(([v, l]) => [v, v === "0" ? "0 — never block" : l] as [string, string]) },
      { id: "confirm", label: "Require approval at severity ≥", kind: "select", options: lvlOptions(true).map(([v, l]) => [v, v === "0" ? "0 — never" : l] as [string, string]), hint: "Must be below the block severity." },
      { id: "approver", label: "Approver address", kind: "address" },
      { id: "ttl", label: "Approval validity (seconds)", kind: "number" },
    ],
    defaults: (d) => ({ block: "4", confirm: "2", approver: "", ttl: String(d.ttl) }),
    encode: (v) => {
      const block = lvl(v.block, "Block severity");
      const confirm = lvl(v.confirm, "Approval severity");
      if (block && confirm >= block) throw new Error("Approval severity must be below the block severity");
      const ttl = uint(v.ttl, "Approval validity");
      const approver = addr(v.approver, "Approver", confirm === 0);
      if (confirm && ttl === 0) throw new Error("Approval validity must be above 0");
      return encodeAbiParameters(
        [{ type: "tuple", components: [{ type: "uint8" }, { type: "uint8" }, { type: "address" }, { type: "uint32" }] }],
        [[block, confirm, approver, ttl]],
      );
    },
    describe: (c) => [
      ["Block at severity", c.blockSeverity ? `≥ ${c.blockSeverity}` : "never"],
      ["Approval at severity", c.confirmSeverity ? `≥ ${c.confirmSeverity}` : "never"],
      ["Approver", c.approver],
    ],
  },
  {
    id: "recovery",
    contract: "recoveryModule",
    moduleType: 2,
    name: "Recovery Module",
    tagline: "Guardian-approved, time-locked controller rotation.",
    description: "Guardians can rotate the account controller after a threshold of approvals and a timelock. The controller can cancel at any time. Recovery never moves assets and never pays out to a recovery wallet.",
    trigger: "Threshold of guardians approve a recovery request and the timelock elapses",
    action: "Calls the account's recoverController(newController); nothing else",
    compat: "ERC-7579 account exposing recoverController to this module (executor, module type 2)",
    abi: recoveryModuleAbi,
    configGetter: "setupOf",
    fields: [
      { id: "guardians", label: "Guardian addresses", kind: "addresses", hint: "Up to 10. Not the account itself.", placeholder: "0x…, 0x…" },
      { id: "threshold", label: "Approvals required", kind: "number" },
      { id: "timelock", label: "Timelock (seconds)", kind: "number", hint: "Minimum 86400 (1 day)." },
    ],
    defaults: () => ({ guardians: "", threshold: "2", timelock: "172800" }),
    encode: (v) => {
      const guardians = addrList(v.guardians, "Guardians");
      const threshold = uint(v.threshold, "Approvals", 255);
      const timelock = uint(v.timelock, "Timelock");
      if (guardians.length > 10) throw new Error("At most 10 guardians");
      if (threshold < 1 || threshold > guardians.length) throw new Error("Approvals must be between 1 and the number of guardians");
      if (timelock < 86400) throw new Error("Timelock must be at least 86400 seconds");
      return encodeAbiParameters(
        [{ type: "tuple", components: [{ type: "address[]" }, { type: "uint8" }, { type: "uint32" }] }],
        [[guardians, threshold, timelock]],
      );
    },
    describe: (c) => [
      ["Guardians", String(c.guardians?.length ?? 0)],
      ["Approvals required", String(c.threshold)],
      ["Timelock", `${c.timelock}s`],
    ],
  },
];

export const hookById = (id: string) => HOOKS.find((h) => h.id === id);
