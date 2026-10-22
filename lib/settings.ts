import { useSyncExternalStore } from "react";
import type { Address } from "viem";
import { DEFAULT_DEPLOYMENTS, type ContractKey, type Deployment } from "./deployments";
import { isSupported } from "./chains";

export interface Settings {
  chainId: number;
  rpcUrls: Record<number, string>;
  deployments: Record<number, Deployment>;
  notifyOnLevelChange: boolean;
  defaults: {
    threatThreshold: number;
    failClosed: boolean;
    approvalTtlSeconds: number;
  };
  tokens: Record<number, Address[]>;
}

const KEY = "qeyro.settings.v1";

const DEFAULTS: Settings = {
  chainId: 11155111,
  rpcUrls: {},
  deployments: {},
  notifyOnLevelChange: false,
  defaults: { threatThreshold: 3, failClosed: true, approvalTtlSeconds: 3600 },
  tokens: {},
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const p = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULTS, ...p, defaults: { ...DEFAULTS.defaults, ...(p.defaults ?? {}) } };
  } catch {
    return DEFAULTS;
  }
}

let state: Settings = load();
const listeners = new Set<() => void>();

export function updateSettings(patch: Partial<Settings>) {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable: keep in memory for this session */
  }
  listeners.forEach((l) => l());
}

export function resetSettings() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  state = DEFAULTS;
  listeners.forEach((l) => l());
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

export const getSettings = () => state;

export function deploymentFor(s: Settings, chainId: number): Deployment {
  return { ...(DEFAULT_DEPLOYMENTS[chainId] ?? {}), ...(s.deployments[chainId] ?? {}) };
}

export function addressFor(s: Settings, chainId: number, key: ContractKey): Address | undefined {
  return deploymentFor(s, chainId)[key];
}

export const activeChainId = (s: Settings) => (isSupported(s.chainId) ? s.chainId : 11155111);
