import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * Renders a QR code for a link (default: the shop's WhatsApp number).
 * Generated client-side into a data URL so it prints reliably.
 */
export function WhatsAppQr({
  value = "https://wa.me/971547002982",
  size = 88,
  caption = "Scan to chat on WhatsApp",
}: {
  value?: string;
  size?: number;
  caption?: string | null;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, {
      margin: 0,
      width: 256,
      errorCorrectionLevel: "M",
      color: { dark: "#1a1024", light: "#ffffff" },
    })
      .then((url) => {
        if (active) setSrc(url);
      })
      .catch(() => setSrc(null));
    return () => {
      active = false;
    };
  }, [value]);

  if (!src) return null;

  return (
    <div className="flex flex-col items-center gap-1">
      <img
        src={src}
        alt="WhatsApp QR code"
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className="rounded-lg bg-white p-1"
      />
      {caption && (
        <p className="max-w-[8rem] text-center text-[9px] leading-tight text-doc-muted">
          {caption}
        </p>
      )}
    </div>
  );
}

export type DocQr = { value: string; label?: string | null };

/** Renders the invoice QR codes (WhatsApp + Google review) side by side. */
export function DocQrCodes({ codes, size = 72 }: { codes: DocQr[]; size?: number }) {
  const list = codes.filter((c) => c.value?.trim());
  if (!list.length) return null;
  return (
    <div className="flex items-start gap-3">
      {list.map((c) => (
        <WhatsAppQr key={c.value} value={c.value} size={size} caption={c.label ?? null} />
      ))}
    </div>
  );
}
