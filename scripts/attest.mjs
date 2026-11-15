// Smoke test + attestation for QoreNames (testnet qorechain-diana):
//  - registers a throwaway test name from the deployer account (hybrid-signed
//    EVM tx — this is the fest's "at least 1 hybrid-signed tx" evidence),
//  - verifies resolve() returns the deployer, then writes attestation.json.
// Run: node scripts/attest.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { qorechainTestnet } from "@qorechain/evm";
import { deriveUnifiedAccount } from "@qorechain/sdk";

const EVM_RPC = "https://evm-testnet.qore.host";
const TEST_NAME = "museng-test";
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

console.log("Contract:", deployed.address);
console.log("Registering test name:", TEST_NAME);
const hash = await walletClient.writeContract({
  address: deployed.address,
  abi: artifact.abi,
  functionName: "register",
  args: [TEST_NAME],
  value: 2n * 10n ** 18n, // "museng-test" is 11 chars -> 2 QOR tier
});
console.log("Register tx:", hash);
const receipt = await publicClient.waitForTransactionReceipt({ hash });
console.log("Status:", receipt.status, "| block:", receipt.blockNumber);

const owner = await publicClient.readContract({
  address: deployed.address,
  abi: artifact.abi,
  functionName: "resolve",
  args: [TEST_NAME],
});
console.log(`resolve(${TEST_NAME}) =`, owner);
if (owner.toLowerCase() !== walletAccount.address.toLowerCase()) {
  console.error("MISMATCH: resolve did not return the deployer");
  process.exit(1);
}

const attestation = {
  project: "Qore Names",
  network: "qorechain-diana",
  chainId: 9800,
  contract: deployed.address,
  deployTx: deployed.deployTx,
  testName: TEST_NAME,
  testNameTx: hash,
  testNameOwner: owner,
  deployerNative: account.cosmos,
  deployerEvm: walletAccount.address,
  explorer: `https://explore.qore.network/tx/${hash}`,
};
writeFileSync(new URL("../attestation.json", import.meta.url), JSON.stringify(attestation, null, 2));
console.log("Wrote attestation.json — contract works end to end.");
process.exit(0);
