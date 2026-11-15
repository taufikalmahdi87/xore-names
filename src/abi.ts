export const NAMES_ABI = [
  {
    type: "function",
    name: "register",
    stateMutability: "payable",
    inputs: [{ name: "name", type: "string" }],
    outputs: [],
  },
  {
    type: "function",
    name: "priceFor",
    stateMutability: "view",
    inputs: [{ name: "name", type: "string" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "resolve",
    stateMutability: "view",
    inputs: [{ name: "name", type: "string" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "reverseResolve",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "namesOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "string[]" }],
  },
  {
    type: "function",
    name: "registeredAt",
    stateMutability: "view",
    inputs: [{ name: "name", type: "string" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "setPrimary",
    stateMutability: "nonpayable",
    inputs: [{ name: "name", type: "string" }],
    outputs: [],
  },
  {
    type: "function",
    name: "transferName",
    stateMutability: "nonpayable",
    inputs: [
      { name: "name", type: "string" },
      { name: "to", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "releaseName",
    stateMutability: "nonpayable",
    inputs: [{ name: "name", type: "string" }],
    outputs: [],
  },
] as const;

export const NAMES_ADDRESS = (import.meta.env.VITE_NAMES_ADDRESS ?? "") as `0x${string}`;

export const EXPLORER = "https://explore.qore.network";

/** Chain id of the QoreChain Diana testnet (EVM lane). The contract lives
 *  only on this chain — transactions on any other chain must be refused
 *  in the UI, never silently sent to the same address elsewhere. */
export const TESTNET_CHAIN_ID = 9800;

/** Names that look official and must never be sold to a stranger.
 *  FRONTEND-ONLY mitigation: the deployed v2 contract has no allowlist,
 *  so this cannot stop a direct contract call — it stops the casual
 *  impersonation path (register "qorechain.qore" / "support.qore" in the
 *  UI, then trick victims into sending QOR to it). A v3 contract should
 *  enforce this list on-chain. */
export const RESERVED_NAMES = new Set([
  "qore",
  "qorechain",
  "qorex",
  "admin",
  "administrator",
  "support",
  "help",
  "official",
  "team",
  "faucet",
  "wallet",
  "security",
  "root",
  "system",
  "info",
  "contact",
  "mod",
  "moderator",
  "owner",
  "founder",
  "gov",
  "governance",
  "treasury",
  "bridge",
  "qday",
]);

export function isReservedName(raw: string): boolean {
  return RESERVED_NAMES.has(raw.trim().toLowerCase());
}

/** Price tiers in QOR (matches the contract): 3 chars 10 / 4 chars 5 / 5+ chars 2. */
export function priceForName(name: string): bigint {
  const len = name.trim().length;
  if (len === 3) return 10n * 10n ** 18n;
  if (len === 4) return 5n * 10n ** 18n;
  return 2n * 10n ** 18n;
}

/** Same rules as the contract: 3-32 chars, [a-z0-9-], no leading/trailing '-'. */
export function validName(raw: string): string | null {
  const name = raw.trim().toLowerCase();
  if (name.length < 3 || name.length > 32) return "Name must be 3–32 characters.";
  if (name.startsWith("-") || name.endsWith("-")) return "Name can't start or end with '-'.";
  if (!/^[a-z0-9-]+$/.test(name)) return "Only lowercase letters, numbers, and '-' are allowed.";
  return null;
}
