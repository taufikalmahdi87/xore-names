# AI Usage

Xore Names was built with Muse, an AI agent running on its own computer with a terminal, a browser, and a filesystem, working in a continuous loop with the human builder Taufik Almahdi over chat. The builder gives short directives in Indonesian. The agent plans the work, builds it, verifies it, and reports back with receipts: exact paths, transaction hashes, and test results. Nothing is reported as done until it is checked on the live testnet or in a headless browser.

This file documents the workflow, the generated work, and the human contribution, as the Best AI-Native Build award requires.

## Workflow

Every feature went through the same loop: build, verify against the real chain or the real site, fix what the check found, verify again. Verification was autonomous. The agent drove a headless browser against the live site to catch layout and connection faults, ran Forge tests against the contract, and read state back from the chain after every transaction instead of trusting its own output.

When a job was big, the agent split it across subagents. The security audit ran as a background review of the contract and the frontend. The demo video was produced by a coordinator with three workers, a recorder, an assembler, and a verifier, so every frame could be checked before delivery. That is the coding agent workflow, the AI security reviewer, and the autonomous testing system the award describes, used together on one project.

The human stayed in the loop at every decision that mattered. The agent never published, uploaded, or moved funds without the builder's explicit go-ahead, and every wallet or account step was done by the builder himself.

## Generated work

The agent generated:

- The QoreNames smart contract in three versions. v1 was a free prototype. v2 added length-based pricing, 10 QOR for 3 characters, 5 for 4, 2 for 5 or more. v3 added the security fixes from the audit: a cap of 10 names per address, transfer that sets the receiver's primary name when empty, and a reentrancy guard on withdraw. Forge tests pass 3 out of 3.
- The full frontend: search and registration, name lookup, my-names management with primary, transfer, and release, send QOR to a name, live pricing while typing, dark mode, and a five-step tutorial. It resolves names through the contract and re-checks the recipient right before sending, aborting if the name changed hands.
- The deployment and operations scripts: chain setup with ML-DSA-87 key registration and EVM window, contract deployment, name registration, withdrawal, and the Q-Day Drill account setup.
- A security audit of the contract and the frontend, with the findings fixed in v3 and in the site builds v8 through v15. The fixes include a wrong-chain guard, confirm dialogs before release and transfer, a reserved-name block, and chunked event queries for the stats bar after the RPC rejected ranges over 10,000 blocks.
- The demo video: script, narration, screen recordings of the real site, and editing. The sends in the video are real on-chain transactions, and the subtitles were checked frame by frame for accuracy.
- The project docs: README, the Q-Day Drill pack, and the submission materials.

## Human contribution

The builder chose the idea. From 32 candidate ideas he picked a .qore name service and set the pricing. He defined the product: a name you register once and use instead of a 42-character address. He funded the deployer account with 10 test QOR, registered the names, and verified the contract on chain himself. He deployed the site on Netlify, created the GitHub repo and the project page, installed the QoreChain Build GitHub App, and registered for the Q-Day Drill. He did every wallet and account step: QoreX, the faucet, and the YouTube sign-in for the video upload.

He also corrected the agent whenever it got something wrong, and those corrections shaped the build. The QoreX wallet must be the Ethereum Account (coin 60), not the native account. The demo must not show the test name. The music must stay below the narration at all times, including during pauses. No em-dash anywhere in anything published. The agent's job was to execute and verify. The decisions were his.

## Evidence

- Contract v3: 0x3263466de1f8d45db977eeed993c5e4fc03af051, deployed in block 10126308 on QoreChain Diana testnet.
- Two names registered on v3, transactions in blocks 10126312 and 10126315.
- Demo video sends: 0.01 QOR in block 10138351 and 0.01 QOR in block 10140988.
- Forge tests: 3 out of 3 pass (test/QoreNames.t.sol).
- Contract balance withdrawn to 0 QOR before the Q-Day Drill, transaction in block 10143799, as drill hardening.
- Site: https://xore-names.netlify.app
- Repo: https://github.com/taufikalmahdi87/xore-names
- Video: https://www.youtube.com/watch?v=ig3FVdE9Mas
