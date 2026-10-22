export const erc7579AccountAbi = [
  { type: "function", name: "accountId", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "supportsModule", stateMutability: "view", inputs: [{ name: "moduleTypeId", type: "uint256" }], outputs: [{ type: "bool" }] },
  {
    type: "function",
    name: "isModuleInstalled",
    stateMutability: "view",
    inputs: [
      { name: "moduleTypeId", type: "uint256" },
      { name: "module", type: "address" },
      { name: "additionalContext", type: "bytes" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "installModule",
    stateMutability: "payable",
    inputs: [
      { name: "moduleTypeId", type: "uint256" },
      { name: "module", type: "address" },
      { name: "initData", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "uninstallModule",
    stateMutability: "payable",
    inputs: [
      { name: "moduleTypeId", type: "uint256" },
      { name: "module", type: "address" },
      { name: "deInitData", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

export const moduleAbi = [
  { type: "function", name: "isModuleType", stateMutability: "view", inputs: [{ name: "id", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "isInitialized", stateMutability: "view", inputs: [{ name: "smartAccount", type: "address" }], outputs: [{ type: "bool" }] },
] as const;

export const erc20Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;
