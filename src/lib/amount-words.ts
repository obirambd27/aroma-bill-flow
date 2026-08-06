const ONES = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];

const TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];

function under1000(n: number): string {
  if (n < 20) return ONES[n]!;
  if (n < 100) {
    const rest = n % 10;
    return TENS[Math.floor(n / 10)]! + (rest ? `-${ONES[rest]}` : "");
  }
  const rest = n % 100;
  return `${ONES[Math.floor(n / 100)]} Hundred${rest ? ` and ${under1000(rest)}` : ""}`;
}

function wholeToWords(n: number): string {
  if (n === 0) return "Zero";
  const groups: [number, string][] = [
    [1_000_000_000, "Billion"],
    [1_000_000, "Million"],
    [1_000, "Thousand"],
  ];
  let remaining = n;
  const parts: string[] = [];
  for (const [value, label] of groups) {
    if (remaining >= value) {
      parts.push(`${under1000(Math.floor(remaining / value))} ${label}`);
      remaining %= value;
    }
  }
  if (remaining > 0) parts.push(under1000(remaining));
  return parts.join(" ");
}

/** "One Thousand Two Hundred and Fifty Dirhams and Fifty Fils Only" */
export function amountInWords(
  value: number | string | null | undefined,
  currency = "Dirhams",
  fraction = "Fils",
) {
  const amount = Math.abs(Number(value ?? 0));
  const whole = Math.floor(amount);
  const cents = Math.round((amount - whole) * 100);
  const main = `${wholeToWords(whole)} ${currency}`;
  return cents > 0
    ? `${main} and ${wholeToWords(cents)} ${fraction} Only`
    : `${main} Only`;
}
