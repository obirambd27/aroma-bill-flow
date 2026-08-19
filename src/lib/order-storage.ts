export type SavedCheckout = {
  name: string;
  phone: string;
  email: string;
  address: string;
};

const key = (token: string) => `fb-order-info-${token}`;

/** localStorage is optional here — privacy modes simply start the form blank. */
export function loadSavedCheckout(token: string): SavedCheckout | null {
  try {
    const raw = localStorage.getItem(key(token));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedCheckout>;
    return {
      name: parsed.name ?? "",
      phone: parsed.phone ?? "",
      email: parsed.email ?? "",
      address: parsed.address ?? "",
    };
  } catch {
    return null;
  }
}

export function saveCheckout(token: string, value: SavedCheckout) {
  try {
    localStorage.setItem(key(token), JSON.stringify(value));
  } catch {
    /* storage unavailable — skip silently */
  }
}

export function clearSavedCheckout(token: string) {
  try {
    localStorage.removeItem(key(token));
  } catch {
    /* storage unavailable — nothing to clear */
  }
}
