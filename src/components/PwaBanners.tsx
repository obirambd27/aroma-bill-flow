import { useEffect, useState } from "react";
import { Download, RefreshCw, Share, WifiOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  applyServiceWorkerUpdate,
  initInstallPrompt,
  isIOS,
  isStandalone,
  registerAppServiceWorker,
  useInstallPrompt,
  useOnlineStatus,
} from "@/lib/pwa";

const IOS_DISMISS_KEY = "fb-ios-install-dismissed";
const INSTALL_DISMISS_KEY = "fb-install-dismissed";

/**
 * App-wide PWA chrome: offline banner, update prompt and the branded install banner.
 * Mounted once inside the authenticated layout.
 */
export function PwaBanners() {
  const online = useOnlineStatus();
  const [updateReady, setUpdateReady] = useState(false);
  const { available, install } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(true);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    registerAppServiceWorker(() => setUpdateReady(true));
    const cleanup = initInstallPrompt();
    setDismissed(localStorage.getItem(INSTALL_DISMISS_KEY) === "1");
    setIosHint(
      isIOS() && !isStandalone() && localStorage.getItem(IOS_DISMISS_KEY) !== "1",
    );
    return cleanup;
  }, []);

  const showInstall = available && !dismissed;

  if (!updateReady && online && !showInstall && !iosHint) return null;

  return (
    <div className="space-y-2 print:hidden">
      {!online && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm">
          <WifiOff className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span>You're offline — some features may not work until you reconnect.</span>
        </div>
      )}

      {updateReady && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm">
          <RefreshCw className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="flex-1">A new version is available.</span>
          <Button size="sm" onClick={applyServiceWorkerUpdate}>
            Refresh to update
          </Button>
        </div>
      )}

      {showInstall && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <Download className="h-4 w-4 shrink-0 text-primary" />
          <span className="flex-1">Install Fragrance Billing for a full-screen, app-like experience.</span>
          <Button size="sm" onClick={() => void install()}>
            Install App
          </Button>
          <button
            type="button"
            aria-label="Dismiss install banner"
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
            onClick={() => {
              localStorage.setItem(INSTALL_DISMISS_KEY, "1");
              setDismissed(true);
            }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {iosHint && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          <Share className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="flex-1">
            To install on iPhone: tap the Share button, then “Add to Home Screen”.
          </span>
          <button
            type="button"
            aria-label="Dismiss iOS install hint"
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
            onClick={() => {
              localStorage.setItem(IOS_DISMISS_KEY, "1");
              setIosHint(false);
            }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

/** Settings entry so anyone who dismissed the banner can still install. */
export function InstallAppButton() {
  const { available, installed, install, iosManual } = useInstallPrompt();

  useEffect(() => initInstallPrompt(), []);

  if (installed) return <p className="text-sm text-muted-foreground">The app is already installed.</p>;

  if (!available)
    return (
      <p className="text-sm text-muted-foreground">
        {iosManual
          ? "On iPhone or iPad: tap the Share button in Safari, then “Add to Home Screen”."
          : "Your browser will offer an install option once the app has loaded. Look for the install icon in the address bar."}
      </p>
    );

  return (
    <Button variant="outline" onClick={() => void install()}>
      <Download />
      Install App
    </Button>
  );
}
