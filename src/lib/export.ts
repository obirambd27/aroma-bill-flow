import * as XLSX from "xlsx";

export type Cell = string | number | null | undefined;

function toText(v: Cell) {
  return v === null || v === undefined ? "" : String(v);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadCSV(filename: string, headers: string[], rows: Cell[][]) {
  const esc = (v: Cell) => {
    const s = toText(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
  triggerDownload(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }), `${filename}.csv`);
}

export function downloadXLSX(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: Cell[][],
) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows.map((r) => r.map((c) => c ?? ""))]);
  ws["!cols"] = headers.map((h, i) => ({
    wch: Math.min(
      32,
      Math.max(h.length + 2, ...rows.map((r) => toText(r[i]).length + 2), 10),
    ),
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

/** Opens a clean print window (user picks "Save as PDF"). */
export function printReport(opts: {
  title: string;
  subtitle?: string;
  summary?: { label: string; value: string }[];
  headers: string[];
  rows: Cell[][];
  numericFrom?: number;
}) {
  const { title, subtitle, summary = [], headers, rows, numericFrom = 99 } = opts;
  const esc = (v: Cell) =>
    toText(v).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:Inter,system-ui,sans-serif;color:#141414;margin:0;padding:24px;font-size:11px}
  h1{font-size:18px;margin:0 0 4px}
  .sub{color:#666;margin:0 0 16px;font-size:11px}
  .summary{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:16px}
  .card{border:1px solid #e3e3e3;border-radius:8px;padding:8px 12px;min-width:130px}
  .card span{display:block;color:#666;font-size:10px;text-transform:uppercase;letter-spacing:.04em}
  .card strong{font-size:14px}
  table{width:100%;border-collapse:collapse}
  th,td{border-bottom:1px solid #e6e6e6;padding:6px 8px;text-align:left;vertical-align:top}
  th{background:#f5f5f5;font-size:10px;text-transform:uppercase;letter-spacing:.04em}
  td.num,th.num{text-align:right;white-space:nowrap}
  tr{page-break-inside:avoid}
  @page{size:A4 landscape;margin:12mm}
</style></head><body>
<h1>${esc(title)}</h1>${subtitle ? `<p class="sub">${esc(subtitle)}</p>` : ""}
${summary.length ? `<div class="summary">${summary.map((s) => `<div class="card"><span>${esc(s.label)}</span><strong>${esc(s.value)}</strong></div>`).join("")}</div>` : ""}
<table><thead><tr>${headers.map((h, i) => `<th class="${i >= numericFrom ? "num" : ""}">${esc(h)}</th>`).join("")}</tr></thead>
<tbody>${rows
    .map(
      (r) =>
        `<tr>${r.map((c, i) => `<td class="${i >= numericFrom ? "num" : ""}">${esc(c)}</td>`).join("")}</tr>`,
    )
    .join("")}</tbody></table>
<script>window.onload=function(){window.print();}<\/script>
</body></html>`;
  const w = window.open("", "_blank", "width=1100,height=800");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}
