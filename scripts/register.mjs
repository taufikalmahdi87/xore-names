// Register one name on QoreNames (testnet qorechain-diana) from the deployer.
// Run: node scripts/register.mjs <name>   (price from length: 3->10, 4->5, 5+->2 QOR)
import { readFileSync } from "node:fs";
import { createWalletClient, createPublicClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { qorechainTestnet } from "@qorechain/evm";
import { deriveUnifiedAccount } from "@qorechain/sdk";

const EVM_RPC = "https://evm-testnet.qore.host";
const NAME = process.argv[2];
if (!NAME || !/^[a-z0-9-]{3,32}$/.test(NAME) || NAME.startsWith("-") || NAME.endsWith("-")) {
  console.error("Usage: node scripts/register.mjs <name>  (lowercase [a-z0-9-], 3-32 chars)");
  process.exit(2);
}
const price = NAME.length === 3 ? 10n : NAME.length === 4 ? 5n : 2n;
const artifact = JSON.parse(
  readFileSync(new URL("../out/QoreNames.sol/QoreNames.json", import.meta.url), "utf8"),
);
const deployed = JSON.parse(readFileSync(new URL("../deployed.json", import.meta.url), "utf8"));
const { mnemonic } = JSON.parse(readFileSync(new URL("../.deployer.json", import.meta.url), "utf8"));
const account = await deriveUnifiedAccount(mnemonic);
const walletAccount = privateKeyToAccount(account.privateKey);

const publicClient = createPublicClient({ chain: qorechainTestnet, transport: http(EVM_RPC) });
const walletClient = createWalletClient({
  account: walletAccount,
  chain: qorechainTestnet,
  transport: http(EVM_RPC),
});

const taken = await publicClient.readContract({
  address: deployed.address,
  abi: artifact.abi,
  functionName: "resolve",
  args: [NAME],
});
console.log(`resolve(${NAME}) before:`, taken);
if (taken !== "0x0000000000000000000000000000000000000000") {
  console.error("Name already taken by", taken);
  process.exit(3);
}

console.log("Contract:", deployed.address);
console.log(`Registering ${NAME}.qore for ${price} QOR ...`);
const hash = await walletClient.writeContract({
  address: deployed.address,
  abi: artifact.abi,
  functionName: "register",
  args: [NAME],
  value: parseEther(price.toString()),
});
console.log("Register tx:", hash);
const receipt = await publicClient.waitForTransactionReceipt({ hash });
console.log("Status:", receipt.status, "| block:", receipt.blockNumber);

const owner = await publicClient.readContract({
  address: deployed.address,
  abi: artifact.abi,
  functionName: "resolve",
  args: [NAME],
});
console.log(`resolve(${NAME}) =`, owner);
if (owner.toLowerCase() !== walletAccount.address.toLowerCase()) {
  console.error("MISMATCH: resolve did not return the deployer");
  process.exit(1);
}
console.log(`DONE: ${NAME}.qore -> ${owner}`);
process.exit(0);
