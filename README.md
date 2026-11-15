# Xore Names: a `.qore` name service on QoreChain

Xore Names is an ENS-style name service on the QoreChain testnet (Diana, EVM
chain 9800). Register a name once and use it instead of a 42-character
address. Any app that reads the registry can resolve it, so people can send
you QOR by name and find you by it.

Live demo: https://xore-names.netlify.app

Built for the QoreChain **Build Before Q-Day** Developer Fest, Quantum Pass
category.

## What it does

Search and register: check a name's availability live and register it. Price
depends on length. 3 characters cost 10 QOR, 4 characters 5 QOR, 5 or more
2 QOR. Names are lowercase `[a-z0-9-]`, 3 to 32 characters, permanent with no
expiry. One address can hold at most 10 names.

Resolve: `resolve(name)` returns the owner's address, and
`reverseResolve(address)` returns the owner's primary name. Any app can
integrate by calling the contract.

Manage: set a primary name, transfer a name, or release one. When a name is
transferred and the receiver has no primary name, the transferred name
becomes their primary automatically.

Send QOR to a name: type a name instead of an address. The app re-resolves
it right before sending and asks for confirmation showing `name.qore (0x…)`.

Live stats: domains, users and transactions, replayed from on-chain events.

## Contract

| Item | Value |
| --- | --- |
| Network | QoreChain Diana testnet, EVM 9800 |
| Contract (v3) | `0x3263466de1f8d45db977eeed993c5e4fc03af051` |
| Deploy tx | `0x3ab5c0fd37c500eaa8188fac89819a71c0eb6403e9e1750f67e9cdab8b88679f` (block 10126308) |
| Explorer | https://explore.qore.network/address/0x3263466de1f8d45db977eeed993c5e4fc03af051 |

`contracts/QoreNames.sol` (Solidity ^0.8.20, MIT). A few things the contract
enforces: at most 10 names per address, so nobody can squat the whole
registry; a reentrancy guard on `withdraw()`; and the exact price for the
name length. Registration is first-come-first-served, so there is no
commit-reveal step. Forge tests: `forge test` (3/3 pass,
`test/QoreNames.t.sol`).

## Run it

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check and production build (dist/)
```

Copy `.env.example` to `.env` and set `VITE_WALLETCONNECT_PROJECT_ID` only
if you want the WalletConnect option in the wallet modal (get one free at
Reown Cloud). QoreX and injected browser wallets do not need it.

## Using it (testnet)

1. Install the **QoreX** app and use an **Ethereum Account** (coin 60). The
   EVM lane only works with this account type.
2. Claim 100 free test QOR at https://dashboard.qorechain.io/faucet.
3. Open an **EVM access window** in QoreX with a spending cap above the name
   price (10 / 5 / 2 QOR) plus the fee. A window also needs a registered
   ML-DSA-87 key, which a first native transfer from the account registers.
4. Open the site in the QoreX app's dApp Browser (or a desktop browser with
   MetaMask / Rabby), connect, and register.

## Networks

| Chain | Id | RPC |
| --- | --- |
| `qorechainTestnet` | 9800 | `https://evm-testnet.qore.host` |
| `qorechain` | 9801 | `https://evm.qore.host` |

The EVM window panel reads the chain's REST API, which sends no CORS
headers, so the dev/preview servers forward `/lcd-testnet` and `/lcd-mainnet`
to it (`vite.config.ts`). In production, the Netlify `_redirects` in `public/`
does the same.

## Credits

Scaffolded with
[`create-qorechain-dapp`](https://www.npmjs.com/package/create-qorechain-dapp)
(viem + wagmi template). Built on
[`@qorechain/evm`](https://www.npmjs.com/package/@qorechain/evm),
[`@qorechain/qorex-rainbowkit`](https://www.npmjs.com/package/@qorechain/qorex-rainbowkit),
[wagmi](https://wagmi.sh), [RainbowKit](https://rainbowkit.com) and
[viem](https://viem.sh). The QoreChain logo and wordmark belong to the Qore
Chain Association.

## Licence

MIT. See [LICENCE](LICENCE).
