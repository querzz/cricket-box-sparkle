import { Check, Clipboard, Download, FileText } from "lucide-react";
import { useState } from "react";

type Cell = string | number | null | undefined;

type Props = {
  filename: string;
  title: string;
  headers: string[];
  rows: Cell[][];
  disabled?: boolean;
};

function valueOf(cell: Cell) {
  return cell == null ? "" : String(cell);
}

function csvCell(value: string) {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function buildTxt(title: string, headers: string[], rows: Cell[][]) {
  const stamp = new Date().toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
  const lines = [
    `CRICKET BOX — ${title}`,
    `Экспорт: ${stamp}`,
    `Записей: ${rows.length}`,
    "",
    ["#", ...headers].join(" | "),
    ...rows.map((row, index) => [String(index + 1), ...row.map(valueOf)].join(" | ")),
  ];
  return lines.join("\n");
}

function buildCsv(headers: string[], rows: Cell[][]) {
  return "\uFEFF" + [
    ["#", ...headers].map(csvCell).join(","),
    ...rows.map((row) => row.map((cell) => csvCell(valueOf(cell))).join(",")),
  ].join("\n");
}

function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ExportListButton({ filename, title, headers, rows, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const isDisabled = disabled || rows.length === 0;

  async function copyList() {
    if (isDisabled) return;
    try {
      await navigator.clipboard.writeText(buildTxt(title, headers, rows));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        disabled={isDisabled}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-primary/25 bg-primary/10 px-3 py-2 text-[10px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
        aria-expanded={open}
      >
        {copied ? <Check className="size-3.5" /> : <Download className="size-3.5" />}
        {copied ? "Скопировано" : "Экспорт"}
      </button>
      {open && !isDisabled && (
        <div className="absolute right-0 top-full z-30 mt-2 min-w-44 rounded-2xl border border-glass-border bg-background/95 p-1.5 shadow-2xl backdrop-blur-xl">
          <button
            type="button"
            onClick={() => {
              downloadFile(`${filename}.txt`, buildTxt(title, headers, rows), "text/plain;charset=utf-8");
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[10px] font-semibold hover:bg-muted/20"
          >
            <FileText className="size-3.5 text-primary-glow" />
            Скачать TXT
          </button>
          <button
            type="button"
            onClick={() => {
              downloadFile(`${filename}.csv`, buildCsv(headers, rows), "text/csv;charset=utf-8");
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[10px] font-semibold hover:bg-muted/20"
          >
            <FileText className="size-3.5 text-primary-glow" />
            Скачать CSV
          </button>
          <button
            type="button"
            onClick={() => {
              void copyList();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[10px] font-semibold hover:bg-muted/20"
          >
            <Clipboard className="size-3.5 text-primary-glow" />
            Скопировать список
          </button>
        </div>
      )}
    </div>
  );
}
