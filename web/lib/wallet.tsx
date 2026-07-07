"use client";

import {
  ComponentType,
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { AccountType } from "@make-software/csprclick-core-types";
import { CHAIN_NAME } from "./casper";

export interface SendDeployOutcome {
  cancelled: boolean;
  deployHash: string | null;
  error: string | null;
}

interface WalletState {
  /** True once the CSPR.click SDK has an appId to initialize against. */
  configured: boolean;
  account: AccountType | null;
  publicKeyHex: string | null;
  connect: () => void;
  disconnect: () => void;
  sendDeploy: (deployJson: unknown, signingPublicKeyHex: string) => Promise<SendDeployOutcome>;
}

const WalletContext = createContext<WalletState | null>(null);

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error("useWallet must be called within <WalletProvider>");
  }
  return ctx;
}

interface ClickRefLike {
  signIn: () => void;
  signOut: () => void;
  send: (deployJson: object, signingPublicKeyHex: string) => Promise<{
    cancelled: boolean;
    deployHash: string | null;
    error: string | null;
  }>;
  getActiveAccount: () => AccountType | null;
  on: (event: string, handler: () => void) => void;
  off: (event: string, handler: () => void) => void;
}

interface ClickRuntime {
  ClickProvider: ComponentType<{ options: Record<string, unknown>; children: ReactNode }>;
  ClickUI: ComponentType<{ themeMode: string }>;
  ThemeModeType: { dark: string };
  useClickRef: () => ClickRefLike;
  CONTENT_MODE: { IFRAME: string };
  CSPRCLICK_EVENTS: Record<string, string>;
}

function WalletBridge({
  children,
  clickRef,
  events,
}: {
  children: ReactNode;
  clickRef: ClickRefLike;
  events: Record<string, string>;
}) {
  const [account, setAccount] = useState<AccountType | null>(null);

  useEffect(() => {
    if (!clickRef) return;

    const syncActiveAccount = () => {
      try {
        setAccount(clickRef.getActiveAccount());
      } catch (err) {
        console.error("[wallet] failed to read active account:", err);
      }
    };
    const clearAccount = () => setAccount(null);
    const signedIn = events.SIGNED_IN;
    const switched = events.SWITCHED_ACCOUNT;
    const signedOut = events.SIGNED_OUT;
    const disconnected = events.DISCONNECTED;

    syncActiveAccount();
    if (signedIn) clickRef.on(signedIn, syncActiveAccount);
    if (switched) clickRef.on(switched, syncActiveAccount);
    if (signedOut) clickRef.on(signedOut, clearAccount);
    if (disconnected) clickRef.on(disconnected, clearAccount);

    return () => {
      if (signedIn) clickRef.off(signedIn, syncActiveAccount);
      if (switched) clickRef.off(switched, syncActiveAccount);
      if (signedOut) clickRef.off(signedOut, clearAccount);
      if (disconnected) clickRef.off(disconnected, clearAccount);
    };
  }, [clickRef, events]);

  const connect = useCallback(() => {
    try {
      clickRef.signIn();
    } catch (err) {
      console.error("[wallet] signIn failed:", err);
    }
  }, [clickRef]);

  const disconnect = useCallback(() => {
    try {
      clickRef.signOut();
    } catch (err) {
      console.error("[wallet] signOut failed:", err);
    }
  }, [clickRef]);

  const sendDeploy = useCallback(
    async (deployJson: unknown, signingPublicKeyHex: string): Promise<SendDeployOutcome> => {
      try {
        const result = await clickRef.send(deployJson as object, signingPublicKeyHex);
        if (!result) {
          return { cancelled: true, deployHash: null, error: "No response from wallet" };
        }
        return {
          cancelled: result.cancelled,
          deployHash: result.deployHash,
          error: result.error,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[wallet] send failed:", message);
        return { cancelled: false, deployHash: null, error: message };
      }
    },
    [clickRef]
  );

  const value = useMemo<WalletState>(
    () => ({
      configured: true,
      account,
      publicKeyHex: account?.public_key ?? null,
      connect,
      disconnect,
      sendDeploy,
    }),
    [account, connect, disconnect, sendDeploy]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

function unavailableWallet(message: string): WalletState {
  return {
    configured: false,
    account: null,
    publicKeyHex: null,
    connect: () => console.error(`[wallet] ${message}`),
    disconnect: () => undefined,
    sendDeploy: async () => ({
      cancelled: true,
      deployHash: null,
      error: message,
    }),
  };
}

const unconfiguredWallet = unavailableWallet(
  "Wallet is not configured (missing NEXT_PUBLIC_CSPR_CLICK_APP_ID)"
);

const loadingWallet = unavailableWallet("Wallet SDK is still loading");

function RuntimeWalletBridge({
  children,
  runtime,
}: {
  children: ReactNode;
  runtime: ClickRuntime;
}) {
  const clickRef = runtime.useClickRef();
  return (
    <WalletBridge clickRef={clickRef} events={runtime.CSPRCLICK_EVENTS}>
      {children}
    </WalletBridge>
  );
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_CSPR_CLICK_APP_ID;
  const [runtime, setRuntime] = useState<ClickRuntime | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  useEffect(() => {
    if (!appId) return;

    let active = true;
    (async () => {
      try {
        const [ui, types] = await Promise.all([
          import("@make-software/csprclick-ui"),
          import("@make-software/csprclick-types"),
        ]);
        if (!active) return;

        setRuntime({
          ClickProvider: ui.ClickProvider as ClickRuntime["ClickProvider"],
          ClickUI: ui.ClickUI as ClickRuntime["ClickUI"],
          ThemeModeType: ui.ThemeModeType as ClickRuntime["ThemeModeType"],
          useClickRef: ui.useClickRef as ClickRuntime["useClickRef"],
          CONTENT_MODE: types.CONTENT_MODE as ClickRuntime["CONTENT_MODE"],
          CSPRCLICK_EVENTS: types.CSPRCLICK_EVENTS as ClickRuntime["CSPRCLICK_EVENTS"],
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[wallet] failed to load CSPR.click runtime:", message);
        if (active) setRuntimeError(message);
      }
    })();

    return () => {
      active = false;
    };
  }, [appId]);

  if (!appId) {
    return (
      <WalletContext.Provider value={unconfiguredWallet}>{children}</WalletContext.Provider>
    );
  }

  if (runtimeError) {
    return (
      <WalletContext.Provider value={unavailableWallet(runtimeError)}>
        {children}
      </WalletContext.Provider>
    );
  }

  if (!runtime) {
    return <WalletContext.Provider value={loadingWallet}>{children}</WalletContext.Provider>;
  }

  const clickOptions = {
    appName: "Parametric Payout Agent",
    appId,
    contentMode: runtime.CONTENT_MODE.IFRAME,
    providers: ["casper-wallet", "ledger", "casperdash", "metamask-snap"],
    chainName: CHAIN_NAME,
  };

  const ClickProvider = runtime.ClickProvider;
  const ClickUI = runtime.ClickUI;

  return (
    <ClickProvider options={clickOptions}>
      <ClickUI themeMode={runtime.ThemeModeType.dark} />
      <RuntimeWalletBridge runtime={runtime}>{children}</RuntimeWalletBridge>
    </ClickProvider>
  );
}
