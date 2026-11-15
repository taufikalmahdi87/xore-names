import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import { injectedWallet } from "@rainbow-me/rainbowkit/wallets";
import { qorechain, qorechainTestnet } from "@qorechain/evm";
import { qorexWallet } from "@qorechain/qorex-rainbowkit";
import { createConfig, createConnector, http, injected } from "wagmi";
import { walletConnect } from "wagmi/connectors";

// QoreX first (the official QoreChain wallet), then MetaMask / Rabby as the
// EVM wallets the QoreChain docs recommend for EVM-lane sends, then any
// other injected (EIP-1193) wallet. WalletConnect is only offered when a
// real project id is configured (VITE_WALLETCONNECT_PROJECT_ID) — without
// one its QR flow cannot start, so it stays hidden instead of dead.
//
// Why these: on a phone browser there is no injected wallet at all, so the
// old list (QoreX + Browser Wallet only) had no working option. MetaMask
// and Rabby are injected-only entries here on purpose: RainbowKit's own
// metaMaskWallet/rabbyWallet build a WalletConnect QR connector eagerly on
// desktop and throw "No projectId found" without a Cloud project id, which
// crashes the whole app. These entries use plain wagmi `injected` with a
// fixed target (same pattern as the official QoreX connector), so they work
// wherever the wallet is actually present — extension, or the wallet app's
// built-in browser — and never touch WalletConnect.
//
// QoreX connects when the site is opened inside the QoreX app's dApp
// Browser (or desktop extension), where window.qorex is injected.

type InjectedEntry = {
  id: string;
  name: string;
  rdns: string;
  iconUrl: string;
  iconBackground: string;
  /** window.ethereum flag that identifies this wallet */
  flag: "isMetaMask" | "isRabby";
  downloadUrls: Record<string, string>;
};

function injectedOnlyWallet(entry: InjectedEntry) {
  const provider = (): any => {
    if (typeof window === "undefined") return undefined;
    const eth = (window as any).ethereum;
    if (!eth || typeof eth.request !== "function") return undefined;
    // Rabby also sets isMetaMask for compatibility; keep the two apart.
    if (entry.flag === "isMetaMask") {
      return eth.isMetaMask === true && eth.isRabby !== true ? eth : undefined;
    }
    return eth.isRabby === true ? eth : undefined;
  };
  return {
    id: entry.id,
    name: entry.name,
    rdns: entry.rdns,
    iconUrl: entry.iconUrl,
    iconBackground: entry.iconBackground,
    installed: typeof window === "undefined" ? undefined : provider() !== undefined,
    downloadUrls: entry.downloadUrls,
    createConnector: (walletDetails: any) =>
      createConnector((config) => {
        const base = injected({
          shimDisconnect: true,
          target: {
            id: entry.id,
            name: entry.name,
            provider,
          },
        })(config);
        return { ...base, ...walletDetails };
      }),
  };
}

// WalletConnect via RainbowKit's OWN QR view (v14).
//
// RainbowKit's stock walletConnectWallet() attaches a second "modal"
// connector and makes the WalletConnect row open the official Web3Modal
// instead of its own QR view. On a phone that modal opens as a fullscreen
// overlay and then has to download the wallet list from the WalletConnect
// Explorer API before it shows anything — on a slow link the screen sits
// blank (verified on paduka's phone 2026-11-15 19:16 WIB: tap → ~6s on the
// list → blank screen, light and dark). The relay + project id were proven
// fine (raw wss test: socket OPEN 25s), so the stall is the modal, not the
// pairing.
//
// This custom wallet keeps the SAME WalletConnect name/icon in the list but
// uses a different wallet id ("walletConnectQr"), so RainbowKit never
// attaches the modal connector, and a plain wagmi walletConnect connector
// with showQrModal: false. Tapping the row now goes to RainbowKit's own QR
// view, which only needs the relay (small data) — no Explorer download, no
// fullscreen overlay, and the modal stays usable while the pairing URI is
// being created. Same pattern as injectedOnlyWallet above.
const WC_ICON =
  "data:image/svg+xml,%3Csvg%20width%3D%2228%22%20height%3D%2228%22%20viewBox%3D%220%200%2028%2028%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%0A%3Crect%20width%3D%2228%22%20height%3D%2228%22%20fill%3D%22%233B99FC%22%2F%3E%0A%3Cpath%20d%3D%22M8.38969%2010.3739C11.4882%207.27538%2016.5118%207.27538%2019.6103%2010.3739L19.9832%2010.7468C20.1382%2010.9017%2020.1382%2011.1529%2019.9832%2011.3078L18.7076%2012.5835C18.6301%2012.6609%2018.5045%2012.6609%2018.4271%2012.5835L17.9139%2012.0703C15.7523%209.9087%2012.2477%209.9087%2010.0861%2012.0703L9.53655%2012.6198C9.45909%2012.6973%209.3335%2012.6973%209.25604%2012.6198L7.98039%2011.3442C7.82547%2011.1893%207.82547%2010.9381%207.98039%2010.7832L8.38969%2010.3739ZM22.2485%2013.012L23.3838%2014.1474C23.5387%2014.3023%2023.5387%2014.5535%2023.3838%2014.7084L18.2645%2019.8277C18.1096%2019.9827%2017.8584%2019.9827%2017.7035%2019.8277C17.7035%2019.8277%2017.7035%2019.8277%2017.7035%2019.8277L14.0702%2016.1944C14.0314%2016.1557%2013.9686%2016.1557%2013.9299%2016.1944C13.9299%2016.1944%2013.9299%2016.1944%2013.9299%2016.1944L10.2966%2019.8277C10.1417%2019.9827%209.89053%2019.9827%209.73561%2019.8278C9.7356%2019.8278%209.7356%2019.8277%209.7356%2019.8277L4.61619%2014.7083C4.46127%2014.5534%204.46127%2014.3022%204.61619%2014.1473L5.75152%2013.012C5.90645%2012.857%206.15763%2012.857%206.31255%2013.012L9.94595%2016.6454C9.98468%2016.6841%2010.0475%2016.6841%2010.0862%2016.6454C10.0862%2016.6454%2010.0862%2016.6454%2010.0862%2016.6454L13.7194%2013.012C13.8743%2012.857%2014.1255%2012.857%2014.2805%2013.012C14.2805%2013.012%2014.2805%2013.012%2014.2805%2013.012L17.9139%2016.6454C17.9526%2016.6841%2018.0154%2016.6841%2018.0541%2016.6454L21.6874%2013.012C21.8424%2012.8571%2022.0936%2012.8571%2022.2485%2013.012Z%22%20fill%3D%22white%22%2F%3E%0A%3C%2Fsvg%3E%0A";

function walletConnectQrWallet(projectId: string) {
  return {
    id: "walletConnectQr",
    name: "WalletConnect",
    iconUrl: WC_ICON,
    iconBackground: "#3b99fc",
    qrCode: { getUri: (uri: string) => uri },
    createConnector: (walletDetails: any) =>
      createConnector((config) => {
        const base = walletConnect({ projectId, showQrModal: false })(config);
        return { ...base, ...walletDetails };
      }),
  };
}

const WC_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined;

const recommendedWallets = [
  () => qorexWallet({ pollAccountsOnFocus: true }),
  () =>
    injectedOnlyWallet({
      id: "metaMask",
      name: "MetaMask",
      rdns: "io.metamask",
      iconUrl: "/metamask.svg",
      iconBackground: "#f6851a",
      flag: "isMetaMask",
      downloadUrls: {
        android: "https://play.google.com/store/apps/details?id=io.metamask",
        ios: "https://apps.apple.com/us/app/metamask/id1438144202",
        mobile: "https://metamask.io/download",
        qrCode: "https://metamask.io/download",
        chrome: "https://chrome.google.com/webstore/detail/metamask/nkbihfbeogaeaoehlefnkodbefgpgknn",
        browserExtension: "https://metamask.io/download",
      },
    }),
  () =>
    injectedOnlyWallet({
      id: "rabby",
      name: "Rabby Wallet",
      rdns: "io.rabby",
      iconUrl: "/rabby.svg",
      iconBackground: "#8697FF",
      flag: "isRabby",
      downloadUrls: {
        mobile: "https://rabby.io",
        chrome: "https://chrome.google.com/webstore/detail/rabby-wallet/acmacodkjbdgmoleebolmdjonilkdbch",
        browserExtension: "https://rabby.io",
      },
    }),
  injectedWallet,
];
if (WC_PROJECT_ID) recommendedWallets.push(() => walletConnectQrWallet(WC_PROJECT_ID));

const connectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      wallets: recommendedWallets,
    },
  ],
  {
    appName: "Xore Names",
    projectId: WC_PROJECT_ID ?? "unused",
  },
);

// The testnet is listed first, so a fresh connection lands there.
export const config = createConfig({
  chains: [qorechainTestnet, qorechain],
  connectors,
  transports: {
    [qorechainTestnet.id]: http(),
    [qorechain.id]: http(),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
