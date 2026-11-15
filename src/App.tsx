import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  QORECHAIN_REST_ENDPOINTS,
  classifyEvmWindowRejection,
  qorechainTestnet,
  evmWindowStatus,
  type EvmWindowRejection,
} from "@qorechain/evm";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { formatEther, isAddress, parseAbiItem, parseEther, zeroAddress } from "viem";
import {
  useAccount,
  useBalance,
  useBlockNumber,
  usePublicClient,
  useReadContract,
  useSendTransaction,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { EXPLORER, NAMES_ABI, NAMES_ADDRESS, TESTNET_CHAIN_ID, isReservedName, priceForName, validName } from "./abi.js";
import { useTheme } from "./theme.js";
import "./App.css";

/** Block the QoreNames contract was deployed at (deployed.json, v3). */
const DEPLOY_BLOCK = 10126308n;

const EVENTS = {
  registered: parseAbiItem("event NameRegistered(string indexed name, address indexed owner, uint256 registeredAt)"),
  transferred: parseAbiItem("event NameTransferred(string indexed name, address indexed from, address indexed to)"),
  released: parseAbiItem("event NameReleased(string indexed name, address indexed owner)"),
  primary: parseAbiItem("event PrimarySet(address indexed owner, string name)"),
} as const;

const REMEDY: Record<EvmWindowRejection, string> = {
  "no-pqc-key":
    "This account has no registered ML-DSA-87 key. Register one on the native lane first (QoreX / setup-chain).",
  "no-window": "No EVM authorisation window is open. Open one from QoreX, then retry.",
  exhausted: "The EVM window is used up (blocks/txs/value). Open a new one.",
  invalid: "The chain refused the window parameters.",
};

const REST_PROXY: Record<number, string | undefined> = Object.fromEntries(
  Object.keys(QORECHAIN_REST_ENDPOINTS).map((id) => [
    Number(id),
    Number(id) === qorechainTestnet.id ? "/lcd-testnet" : "/lcd-mainnet",
  ]),
);

function WindowStatus({ address, chainId }: { address: `0x${string}`; chainId: number }) {
  const rest = REST_PROXY[chainId];
  const { data, error, isLoading } = useQuery({
    queryKey: ["evm-window", chainId, address],
    queryFn: () => evmWindowStatus({ rest: rest!, address }),
    enabled: rest !== undefined,
    refetchInterval: 10_000,
  });
  if (!rest) return <p className="xore-addr">Unknown network.</p>;
  if (isLoading) return <p className="xore-addr">Reading the EVM window...</p>;
  if (error) return <p className="xore-addr">Could not read the window: {error.message}</p>;
  if (!data?.found) {
    return <p className="xore-addr">EVM window: none. Transactions from this account are refused until a window is opened.</p>;
  }
  return (
    <p className="xore-addr">
      EVM window: {data.live ? "live" : "not usable"} ({data.remainingBlocks.toString()} blocks,{" "}
      {data.remainingTxs.toString()} txs, {data.remainingValue.toString()} uqor left)
    </p>
  );
}

const POPULAR = ["lomen", "crypto", "web3", "builder", "dream"];

export function App() {
  const { theme, toggle: toggleTheme } = useTheme();
  const { address, chainId, isConnected } = useAccount();
  // The contract only exists on the Diana testnet (9800). A wallet on
  // mainnet (9801) would read empty data and every write would burn gas
  // against an address with no code — so all writes stay disabled there.
  const wrongChain = isConnected && chainId !== undefined && chainId !== qorechainTestnet.id;
  const { data: balance } = useBalance({ address });
  const { data: block } = useBlockNumber({ watch: true });
  const publicClient = usePublicClient();
  const { writeContract, data: txHash, error: writeError, isPending } = useWriteContract();
  const { data: receipt, isLoading: confirming } = useWaitForTransactionReceipt({ hash: txHash });
  const rejection = writeError ? classifyEvmWindowRejection(writeError) : undefined;
  const { sendTransaction, data: sendTxHash, error: sendError, isPending: sendPending } = useSendTransaction();
  const { data: sendReceipt, isLoading: sendConfirming } = useWaitForTransactionReceipt({ hash: sendTxHash });
  const sendRejection = sendError ? classifyEvmWindowRejection(sendError) : undefined;

  const [searchName, setSearchName] = useState("");
  const [activeNav, setActiveNav] = useState("home");
  const [lookupName, setLookupName] = useState("");
  const [lookupAddr, setLookupAddr] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferName, setTransferName] = useState("");
  const [sendName, setSendName] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendCheckError, setSendCheckError] = useState("");
  const [docsOpen, setDocsOpen] = useState(false);

  const deployed = NAMES_ADDRESS.length > 0;
  const searchError = searchName ? validName(searchName) : null;
  const searchClean = searchName.trim().toLowerCase();
  // Reserved names (official-looking) are refused in the UI — see abi.ts.
  // "qore" was removed from POPULAR for the same reason.
  const searchReserved = searchClean.length >= 3 && !searchError && isReservedName(searchClean);
  // The contract lives ONLY on Diana testnet (9800). wagmi also lists
  // mainnet, so a connected mainnet wallet must never be able to fire a
  // register/send/transfer tx at the same address on the wrong chain.
  const isTestnet = chainId === TESTNET_CHAIN_ID;

  // Live availability for the hero search.
  const { data: searchOwner } = useReadContract({
    address: NAMES_ADDRESS || zeroAddress,
    abi: NAMES_ABI,
    functionName: "resolve",
    args: [searchClean || "___"],
    query: { enabled: deployed && !searchError && searchClean.length >= 3, refetchInterval: 5_000 },
  });
  const searchTaken = searchOwner !== undefined && searchOwner !== zeroAddress;
  const searchPrice = searchClean.length >= 3 && !searchError ? priceForName(searchClean) : 0n;

  // Send-to-name: resolve the typed name to its owner's address, live.
  const sendClean = sendName.trim().toLowerCase();
  const sendNameError = sendName ? validName(sendName) : null;
  const { data: sendOwner } = useReadContract({
    address: NAMES_ADDRESS || zeroAddress,
    abi: NAMES_ABI,
    functionName: "resolve",
    args: [sendClean || "___"],
    query: { enabled: deployed && !sendNameError && sendClean.length >= 3 },
  });
  const sendTo = sendOwner !== undefined && sendOwner !== zeroAddress ? sendOwner : undefined;
  let sendValue: bigint | null = null;
  try {
    sendValue = sendAmount.trim() ? parseEther(sendAmount.trim()) : null;
  } catch {
    sendValue = null;
  }
  const sendDisabled =
    !sendTo ||
    !sendValue ||
    sendValue <= 0n ||
    // Sending the whole balance can never succeed: the fee comes out of
    // the same balance, so the amount must leave gas behind.
    (balance !== undefined && sendValue >= balance.value) ||
    sendPending ||
    wrongChain;

  // Real on-chain stats from contract events (no fake numbers).
  // The RPC rejects eth_getLogs ranges over 10,000 blocks, so the replay
  // is chunked (9,000 blocks per call) — without this the stats stay "…"
  // once the chain grows past 10k blocks after deploy.
  const { data: stats } = useQuery({
    queryKey: ["xore-stats", NAMES_ADDRESS],
    queryFn: async () => {
      if (!publicClient || !deployed) return null;
      const latest = await publicClient.getBlockNumber();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chunked = async (event: any) => {
        const out: any[] = [];
        for (let from = DEPLOY_BLOCK; from <= latest; from += 9000n) {
          const to = from + 9000n - 1n > latest ? latest : from + 9000n - 1n;
          out.push(...(await publicClient.getLogs({ address: NAMES_ADDRESS, event, fromBlock: from, toBlock: to })));
        }
        return out;
      };
      const [reg, tr, rel, pri] = await Promise.all([
        chunked(EVENTS.registered),
        chunked(EVENTS.transferred),
        chunked(EVENTS.released),
        chunked(EVENTS.primary),
      ]);
      // Current ownership, replayed from events: registrations add, transfers
      // move, releases remove — so the counts show who owns what NOW, not
      // who ever registered (a released name's old owner is not active).
      const current = new Map<string, string>();
      for (const l of reg) current.set((l.args.name as string).toLowerCase(), (l.args.owner as string).toLowerCase());
      for (const l of tr) current.set((l.args.name as string).toLowerCase(), (l.args.to as string).toLowerCase());
      for (const l of rel) current.delete((l.args.name as string).toLowerCase());
      return {
        totalDomains: current.size,
        activeUsers: new Set(current.values()).size,
        transactions: reg.length + tr.length + rel.length + pri.length,
      };
    },
    enabled: deployed && !!publicClient,
    refetchInterval: 30_000,
  });

  // Lookup by name.
  const { data: lookupOwner, refetch: refetchLookup } = useReadContract({
    address: NAMES_ADDRESS || zeroAddress,
    abi: NAMES_ABI,
    functionName: "resolve",
    args: [lookupName.trim().toLowerCase() || "___"],
    query: { enabled: false },
  });

  // Reverse lookup by address.
  const { data: reverseName, refetch: refetchReverse } = useReadContract({
    address: NAMES_ADDRESS || zeroAddress,
    abi: NAMES_ABI,
    functionName: "reverseResolve",
    args: [(isAddress(lookupAddr) ? lookupAddr : zeroAddress) as `0x${string}`],
    query: { enabled: false },
  });

  // My names.
  const { data: myNames, refetch: refetchMine } = useReadContract({
    address: NAMES_ADDRESS || zeroAddress,
    abi: NAMES_ABI,
    functionName: "namesOf",
    args: [address ?? zeroAddress],
    query: { enabled: deployed && isConnected && !!address, refetchInterval: 10_000 },
  });

  // EVM authorisation window for the connected account. The chain refuses
  // every EVM tx while no window is live, and wagmi's gas estimation fails
  // before the wallet is ever asked to sign — so without this check the Find
  // button just flickers and no popup appears. Surface it here, next to the
  // button, instead of only in the panel below.
  const windowRest = chainId ? REST_PROXY[chainId] : undefined;
  const { data: evmWindow } = useQuery({
    queryKey: ["evm-window-hero", chainId, address],
    queryFn: () => evmWindowStatus({ rest: windowRest!, address: address! }),
    enabled: isConnected && !!address && windowRest !== undefined,
    refetchInterval: 10_000,
  });
  const windowClosed =
    isConnected && evmWindow !== undefined && (!evmWindow.found || !evmWindow.live);

  const findDisabled =
    isPending ||
    !!searchError ||
    searchTaken ||
    searchReserved ||
    searchClean.length < 3 ||
    !isConnected ||
    windowClosed ||
    wrongChain;

  function doRegister(name: string) {
    if (!deployed || validName(name)) return;
    const clean = name.trim().toLowerCase();
    if (isReservedName(clean)) return;
    writeContract({
      address: NAMES_ADDRESS,
      abi: NAMES_ABI,
      functionName: "register",
      args: [clean],
      value: priceForName(clean),
    });
  }

  return (
    <div className="xore-page" id="home">
      <header className="xore-header">
        <a className="xore-brand" href="#home">
          <img src="/qorechain-icon.png" alt="QoreChain" />
          <b>QORECHAIN</b>
          <span className="sep">|</span>
          <span className="prod">Xore Names</span>
        </a>
        <nav className="xore-nav">
          {(
            [
              ["home", "Home"],
              ["domains", "Domains"],
              ["profile", "Profile"],
              ["dashboard", "Dashboard"],
              ["tutorial", "Tutorial"],
            ] as const
          ).map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className={activeNav === id ? "active" : ""}
              onClick={(e) => {
                e.preventDefault();
                setActiveNav(id);
                document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              {label}
            </a>
          ))}
          <button
            type="button"
            className={docsOpen ? "active" : ""}
            aria-expanded={docsOpen}
            onClick={() => setDocsOpen((o) => !o)}
          >
            Docs ▾
          </button>
        </nav>
        <div className="xore-head-right">
          <button
            type="button"
            className="xore-theme-btn"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Light mode" : "Dark mode"}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
          {!isConnected && <span className="xore-testnet"><span className="xore-dot" /> Testnet</span>}
          {/* chainStatus="icon" + address-only + no balance: RainbowKit's
              full connected pill (chain name + balance + avatar + address)
              is ~315px — together with the theme button and the Testnet pill
              it forces the header (and the whole page) wider than a 360px
              phone when connected, and even overflows the 1240px header on
              desktop. The icon still opens the chain switcher; the balance
              is shown in the account panel below. */}
          <ConnectButton chainStatus="icon" accountStatus="address" showBalance={false} />
        </div>
        {docsOpen && (
          <>
            <div className="xore-docs-backdrop" onClick={() => setDocsOpen(false)} />
            <div className="xore-docs-menu">
              <a href="https://docs.qorechain.io" target="_blank" rel="noreferrer" onClick={() => setDocsOpen(false)}>
                QoreChain Docs<span>Guides, SDKs and the EVM window rules</span>
              </a>
              <a href="https://dashboard.qorechain.io/faucet" target="_blank" rel="noreferrer" onClick={() => setDocsOpen(false)}>
                Claim test QOR<span>100 free test QOR per day</span>
              </a>
              <a href="https://explore.qore.network" target="_blank" rel="noreferrer" onClick={() => setDocsOpen(false)}>
                Explorer<span>Transactions, blocks and contracts</span>
              </a>
              <a href="https://build.qorechain.io" target="_blank" rel="noreferrer" onClick={() => setDocsOpen(false)}>
                Build Before Q-Day<span>The developer fest behind this app</span>
              </a>
            </div>
          </>
        )}
      </header>

      <section className="xore-hero">
        <div>
          <span className="xore-badge"><span className="xore-dot" /> QORECHAIN Ecosystem <span className="div">|</span> Web3 Name Service</span>
          <h1>
            Xore Names<br />
            Your Identity<br />
            <span className="grad">Beyond Addresses.</span>
          </h1>
          <p className="sub">
            Register, manage, and own your Web3 name on QORECHAIN. A decentralized name
            service for the next generation.
          </p>

          <div className="xore-search" id="domains">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input
              type="text"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              placeholder="Search for your name..."
              onKeyDown={(e) => { if (e.key === "Enter" && !findDisabled) doRegister(searchClean); }}
            />
            <span className="tld">.qore</span>
            <button
              type="button"
              className="xore-btn"
              disabled={findDisabled}
              onClick={() => doRegister(searchClean)}
            >
              {isPending ? "Sending..." : "Find Your Name →"}
            </button>
          </div>
          {windowClosed && (
            <p className="xore-avail err">
              Your EVM window is closed — the chain refuses transactions until you open one, so no
              wallet popup appears. In QoreX: Settings → Security → EVM access window, open a
              window, then come back and tap Find again.
            </p>
          )}
          {wrongChain && (
            <p className="xore-avail err">
              You're on chain {chainId} — switch to QoreChain Testnet (9800) in your wallet. This
              app's contract only lives on testnet; writes are disabled here so you can't burn gas
              on the wrong network.
            </p>
          )}
          {!isConnected && (
            <>
              <p className="xore-avail err">Connect your wallet to register a name.</p>
              <p className="xore-addr">
                On your phone, open this site inside the QoreX app's dApp Browser — switch QoreX to
                testnet first (Settings → Use testnet). MetaMask and Rabby work too: tap one and it
                opens its app.
              </p>
            </>
          )}
          {searchError ? (
            <p className="xore-avail err">{searchError}</p>
          ) : searchReserved ? (
            <p className="xore-avail err">{searchClean}.qore is reserved and can't be registered.</p>
          ) : searchClean.length >= 3 ? (
            <p className={`xore-avail ${searchTaken ? "no" : "ok"}`}>
              {searchClean}.qore — {formatEther(searchPrice)} QOR
              {searchOwner === undefined
                ? " · checking availability…"
                : searchTaken
                  ? " · already taken."
                  : " · available. Click Find Your Name to register."}
            </p>
          ) : null}
          <p className="xore-addr" style={{ marginTop: "0.4rem" }}>
            Price: 3 letters 10 QOR · 4 letters 5 QOR · 5+ letters 2 QOR (test QOR)
          </p>

          <div className="xore-popular">
            <span>Popular Domains:</span>
            {POPULAR.map((n) => (
              <button key={n} type="button" className="xore-chip" onClick={() => setSearchName(n)}>
                {n}.qore
              </button>
            ))}
          </div>
        </div>

        <div className="xore-hero-art">
          <img src="/qorechain-icon.png" alt="QoreChain" />
          <div className="wordmark">
            <b>QORECHAIN</b>
            <span>Xore Names</span>
            <small>DECENTRALIZED NAME SERVICE</small>
          </div>
        </div>
      </section>

      <section className="xore-stats" id="dashboard">
        <div className="xore-stats-card">
          <div className="xore-stat"><span className="ic">🌐</span><b>{stats ? stats.totalDomains.toLocaleString() : "…"}</b><span>Total Domains</span></div>
          <div className="xore-stat"><span className="ic">👥</span><b>{stats ? stats.activeUsers.toLocaleString() : "…"}</b><span>Active Users</span></div>
          <div className="xore-stat"><span className="ic">🧊</span><b>{stats ? stats.transactions.toLocaleString() : "…"}</b><span>Transactions</span></div>
          <div className="xore-stat"><span className="ic">📊</span><b>{block ? `#${Number(block).toLocaleString()}` : "…"}</b><span>Latest Block</span></div>
          <a className="xore-testnet-card" href={`${EXPLORER}/address/${NAMES_ADDRESS}`} target="_blank" rel="noreferrer">
            <span className="xore-dot" />
            <span><b>QORECHAIN Testnet</b><span>Explore the future, together.</span></span>
            <span className="go">›</span>
          </a>
        </div>
      </section>

      <section className="xore-tutorial" id="tutorial">
        <span className="xore-kicker">Tutorial</span>
        <h2>Claim your name in <span className="grad">5 steps.</span></h2>
        <p className="sub">Names are cheap and permanent — here is the exact path to register yours on the QoreChain testnet.</p>
        <div className="xore-tut-grid">
          <div className="xore-tut-step">
            <span className="num">1</span>
            <b>Install the QoreX app</b>
            <p>QoreX is the official QoreChain wallet — and right now the <b>mobile app</b> is the only wallet that supports the Diana testnet. The QoreX browser extension does not support testnet yet, so use the app (Android / iOS).</p>
          </div>
          <div className="xore-tut-step">
            <span className="num">2</span>
            <b>Use an Ethereum Account (coin 60)</b>
            <p>In the QoreX app, add an Ethereum Account: Settings → Your accounts → <b>Add an Ethereum account (coin 60)</b>. The EVM lane only works with this account type.</p>
          </div>
          <div className="xore-tut-step">
            <span className="num">3</span>
            <b>Claim free test QOR</b>
            <p>Open <a href="https://dashboard.qorechain.io/faucet" target="_blank" rel="noreferrer">dashboard.qorechain.io/faucet</a>, sign in, and claim <b>100 free test QOR</b> to your account (paste its <span className="xore-mono">qor1…</span> address — the same account, in its native form).</p>
          </div>
          <div className="xore-tut-step">
            <span className="num">4</span>
            <b>Open an EVM access window</b>
            <p>In QoreX: Settings → Security → <b>EVM access window</b>. Set the spending cap <b>above your name's price</b> — 10 QOR for 3 letters, 5 QOR for 4 letters, 2 QOR for 5+ letters — or the chain will refuse the transaction.</p>
          </div>
          <div className="xore-tut-step">
            <span className="num">5</span>
            <b>Register in the dApp Browser</b>
            <p>Open this site inside the QoreX app's <b>dApp Browser</b>, connect your Ethereum Account, search your name and tap <b>Find Your Name</b>. Approve the transaction in QoreX — the name is yours.</p>
          </div>
        </div>
        <p className="xore-tut-note">Heads up: the QoreX browser extension cannot sign EVM transactions yet and has no testnet network — the mobile app is the way to register.</p>
      </section>

      <section className="xore-how">
        <div>
          <span className="xore-kicker">How It Works</span>
          <h2>Get Your Web3 Name<br />in <span className="grad">3 Simple Steps.</span></h2>
          <p className="sub">Join the decentralized naming revolution on QORECHAIN.</p>
        </div>
        <div className="xore-steps">
          <div className="xore-step"><span className="num">1</span><div className="ic">🔍</div><b>Search &amp; Check</b><p>Find your desired name and check availability.</p></div>
          <div className="xore-step"><span className="num">2</span><div className="ic">💼</div><b>Register On-Chain</b><p>Confirm the transaction with your wallet.</p></div>
          <div className="xore-step"><span className="num">3</span><div className="ic">👤</div><b>Manage Your Identity</b><p>Set your profile, records, and more.</p></div>
        </div>
      </section>

      <main className="xore-app" id="profile">
        {isConnected && address && chainId ? (
          <>
            <div className="xore-panel">
              <h2>Your account</h2>
              <p className="xore-addr">
                <span className="xore-mono">{address}</span> on chain {chainId} · Balance:{" "}
                {balance ? `${formatEther(balance.value)} QOR` : "..."}
              </p>
              <WindowStatus address={address} chainId={chainId} />
              <p className="xore-addr">
                Contract:{" "}
                <a href={`${EXPLORER}/address/${NAMES_ADDRESS}`} target="_blank" rel="noreferrer">
                  <span className="xore-mono">{NAMES_ADDRESS}</span>
                </a>
              </p>
            </div>

            <div className="xore-panel">
              <h2>My names</h2>
              <p className="note">Names you registered. One name can be set as your primary.</p>
              {!myNames || myNames.length === 0 ? (
                <p className="note">No names yet. Search above and register — 3 letters 10 QOR, 4 letters 5 QOR, 5+ letters 2 QOR.</p>
              ) : (
                <ul className="xore-list">
                  {myNames.map((n) => (
                    <li key={n}>
                      <b>{n}.qore</b>
                      <button
                        type="button"
                        className="xore-mini"
                        disabled={wrongChain}
                        onClick={() =>
                          writeContract({ address: NAMES_ADDRESS, abi: NAMES_ABI, functionName: "setPrimary", args: [n] })
                        }
                      >
                        Make primary
                      </button>
                      <button
                        type="button"
                        className="xore-mini"
                        disabled={wrongChain}
                        onClick={() => {
                          // One stray tap used to free the name forever — and
                          // a bot watching the event could snipe it before
                          // you re-register. Ask first.
                          if (window.confirm(`Release ${n}.qore? Anyone can register it after that, including bots.`)) {
                            writeContract({ address: NAMES_ADDRESS, abi: NAMES_ABI, functionName: "releaseName", args: [n] });
                          }
                        }}
                      >
                        Release
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="xore-row">
                <input type="text" value={transferName} onChange={(e) => setTransferName(e.target.value)} placeholder="name to transfer" style={{ width: "12rem" }} />
                <input type="text" value={transferTo} onChange={(e) => setTransferTo(e.target.value)} placeholder="0x destination address" style={{ width: "min(22rem, 100%)" }} />
                <button
                  type="button"
                  className="xore-btn xore-btn-sm"
                  disabled={!isAddress(transferTo) || !!validName(transferName) || wrongChain}
                  onClick={() => {
                    // Transfers can't be undone — a mistyped address loses
                    // the name for good. Ask first.
                    const clean = transferName.trim().toLowerCase();
                    if (window.confirm(`Transfer ${clean}.qore to ${transferTo}? This can't be undone.`)) {
                      writeContract({
                        address: NAMES_ADDRESS,
                        abi: NAMES_ABI,
                        functionName: "transferName",
                        args: [clean, transferTo as `0x${string}`],
                      });
                    }
                  }}
                >
                  Transfer
                </button>
                <button type="button" className="xore-mini" onClick={() => refetchMine()}>Reload</button>
              </div>
              {transferName.trim() && validName(transferName) && (
                <p className="xore-err">{validName(transferName)}</p>
              )}
            </div>

            <div className="xore-panel">
              <h2>Look up a name / address</h2>
              <div className="xore-row">
                <input type="text" value={lookupName} onChange={(e) => setLookupName(e.target.value)} placeholder="name (without .qore)" style={{ width: "min(14rem, 100%)" }} />
                <button type="button" className="xore-btn xore-btn-sm" onClick={() => refetchLookup()}>Find owner</button>
                {lookupOwner !== undefined && lookupName.trim() && (
                  <span>{lookupName.trim().toLowerCase()}.qore → {lookupOwner === zeroAddress ? "not registered" : <span className="xore-mono">{lookupOwner}</span>}</span>
                )}
              </div>
              <div className="xore-row" style={{ marginTop: "0.75rem" }}>
                <input type="text" value={lookupAddr} onChange={(e) => setLookupAddr(e.target.value)} placeholder="0x address" style={{ width: "min(22rem, 100%)" }} />
                <button type="button" className="xore-btn xore-btn-sm" onClick={() => refetchReverse()}>Find primary name</button>
                {reverseName !== undefined && lookupAddr.trim() && (
                  <span>Primary name: {reverseName ? <b>{reverseName}.qore</b> : "none"}</span>
                )}
              </div>
            </div>

            <div className="xore-panel">
              <h2>Send QOR to a name</h2>
              <p className="note">Type a name, not an address — it resolves to the owner's wallet on-chain.</p>
              <div className="xore-row">
                <input type="text" value={sendName} onChange={(e) => setSendName(e.target.value)} placeholder="name (without .qore)" style={{ width: "min(14rem, 100%)" }} />
                <input type="text" value={sendAmount} onChange={(e) => setSendAmount(e.target.value)} placeholder="amount in QOR" inputMode="decimal" style={{ width: "min(10rem, 100%)" }} />
                <button
                  type="button"
                  className="xore-btn xore-btn-sm"
                  disabled={sendDisabled}
                  onClick={async () => {
                    if (!sendTo || !sendValue || !publicClient) return;
                    setSendCheckError("");
                    // The address shown was resolved when the name was typed.
                    // The name could have been transferred, released or
                    // re-registered since — re-resolve right before sending
                    // and abort if it moved.
                    let fresh: `0x${string}`;
                    try {
                      fresh = (await publicClient.readContract({
                        address: NAMES_ADDRESS,
                        abi: NAMES_ABI,
                        functionName: "resolve",
                        args: [sendClean],
                      })) as `0x${string}`;
                    } catch {
                      setSendCheckError("Couldn't re-check that name right now — try again.");
                      return;
                    }
                    if (fresh.toLowerCase() !== sendTo.toLowerCase()) {
                      setSendCheckError(`${sendClean}.qore just changed hands — re-check the address before sending.`);
                      return;
                    }
                    if (window.confirm(`Send ${formatEther(sendValue)} QOR to ${sendClean}.qore (${sendTo})?`)) {
                      sendTransaction({ to: sendTo, value: sendValue });
                    }
                  }}
                >
                  {sendPending ? "Sending..." : "Send"}
                </button>
              </div>
              {sendClean.length >= 3 && !sendNameError && sendOwner !== undefined && (
                <p className="xore-addr">
                  {sendClean}.qore → {sendTo ? <span className="xore-mono">{sendTo}</span> : "not registered"}
                </p>
              )}
              {sendNameError && sendName.trim() && <p className="xore-err">{sendNameError}</p>}
              {sendCheckError && <p className="xore-err">{sendCheckError}</p>}
              {balance !== undefined && sendValue !== null && sendValue >= balance.value && (
                <p className="xore-err">Amount is too high — leave some QOR for gas, it can't be your full balance.</p>
              )}
              <p className="note">Your EVM window's spending cap must cover this amount plus the fee.</p>
              {sendTxHash && (
                <p className="xore-tx">
                  Tx:{" "}
                  <a href={`${EXPLORER}/tx/${sendTxHash}`} target="_blank" rel="noreferrer">
                    <span className="xore-mono">{sendTxHash}</span>
                  </a>{" "}
                  {sendConfirming ? "(waiting for confirmation...)" : sendReceipt?.status === "success" ? <span className="xore-ok">(confirmed ✓)</span> : sendReceipt ? <span className="xore-err">(failed)</span> : ""}
                </p>
              )}
              {sendError && <p className="xore-err">Rejected: {sendRejection ? REMEDY[sendRejection] : sendError.message}</p>}
            </div>

            {txHash && (
              <p className="xore-tx">
                Tx:{" "}
                <a href={`${EXPLORER}/tx/${txHash}`} target="_blank" rel="noreferrer">
                  <span className="xore-mono">{txHash}</span>
                </a>{" "}
                {confirming ? "(waiting for confirmation...)" : receipt?.status === "success" ? <span className="xore-ok">(confirmed ✓)</span> : receipt ? <span className="xore-err">(failed)</span> : ""}
              </p>
            )}
            {writeError && <p className="xore-err">Rejected: {rejection ? REMEDY[rejection] : writeError.message}</p>}
          </>
        ) : (
          <div className="xore-panel">
            <h2>Connect your wallet first</h2>
            <p className="note">Use QoreX on the Diana testnet to register and manage your names.</p>
          </div>
        )}
      </main>

      <footer className="xore-foot">
        Xore Names — built on QoreChain testnet (Diana, EVM 9800). Contract{" "}
        <a href={`${EXPLORER}/address/${NAMES_ADDRESS}`} target="_blank" rel="noreferrer">{NAMES_ADDRESS}</a>
      </footer>
    </div>
  );
}
