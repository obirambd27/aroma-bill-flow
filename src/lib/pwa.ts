import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<(available: boolean) => void>();

function notify() {
  for (const l of listeners) l(deferredPrompt !== null);
}

/** True in dev, iframes and Lovable preview hosts — never register a service worker there. */
export function serviceWorkerBlocked() {
  if (typeof window === "undefined") return true;
  if (!import.meta.env.PROD) return true;
  if (window.self !== window.top) return true;
  if (new URL(window.location.href).searchParams.get("sw") === "off") return true;
  const h = window.location.hostname;
  return (
    h.startsWith("id-preview--") ||
    h.startsWith("preview--") ||
    h === "lovableproject.com" ||
    h.endsWith(".lovableproject.com") ||
    h === "lovableproject-dev.com" ||
    h.endsWith(".lovableproject-dev.com") ||
    h === "beta.lovable.dev" ||
    h.endsWith(".beta.lovable.dev")
  );
}

async function unregisterAppWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.allSettled(
    regs
      .filter((r) => (r.active?.scriptURL ?? r.waiting?.scriptURL ?? "").includes("/sw.js"))
      .map((r) => r.unregister()),
  );
}

/** Registers the generated service worker outside dev/preview. Returns an update trigger. */
export function registerAppServiceWorker(onNeedRefresh: () => void) {
  if (serviceWorkerBlocked()) {
    void unregisterAppWorker();
    return;
  }
  void import("virtual:pwa-register").then(({ registerSW }) => {
    updateApp = registerSW({ immediate: true, onNeedRefresh });
  });
}

let updateApp: ((reload?: boolean) => Promise<void>) | null = null;

export function applyServiceWorkerUpdate() {
  if (updateApp) void updateApp(true);
  else window.location.reload();
}

export function initInstallPrompt() {
  if (typeof window === "undefined") return () => {};
  const onBefore = (e: Event) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  };
  const onInstalled = () => {
    deferredPrompt = null;
    notify();
  };
  window.addEventListener("beforeinstallprompt", onBefore);
  window.addEventListener("appinstalled", onInstalled);
  return () => {
    window.removeEventListener("beforeinstallprompt", onBefore);
    window.removeEventListener("appinstalled", onInstalled);
  };
}

export function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** Install availability + a trigger for the branded install button. */
export function useInstallPrompt() {
  const [available, setAvailable] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setAvailable(deferredPrompt !== null);
    setInstalled(isStandalone());
    listeners.add(setAvailable);
    return () => {
      listeners.delete(setAvailable);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    notify();
    return choice.outcome === "accepted";
  };

  return { available, installed, install, iosManual: isIOS() && !isStandalone() };
}

export function useOnlineStatus() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}
