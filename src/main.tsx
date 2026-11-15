import "@rainbow-me/rainbowkit/styles.css";

import { darkTheme, lightTheme, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { createRoot } from "react-dom/client";
import { WagmiProvider } from "wagmi";

import { App } from "./App.js";
import { config } from "./wagmi.js";
import { ThemeProvider, useTheme } from "./theme.js";

const queryClient = new QueryClient();

function Providers() {
  const { theme } = useTheme();
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={
            theme === "dark"
              ? darkTheme({ accentColor: "#7c3aed", accentColorForeground: "white" })
              : lightTheme({ accentColor: "#7c3aed", accentColorForeground: "white" })
          }
        >
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element #root not found");
}

createRoot(container).render(
  <React.StrictMode>
    <ThemeProvider>
      <Providers />
    </ThemeProvider>
  </React.StrictMode>,
);
