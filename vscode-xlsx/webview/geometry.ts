/** Sparse axis: no array proportional to Excel's maximum row count. */
export class Axis {
  private sizes: Map<number, number>;
  private entries: [number, number][];
  private deltas: number[];
  constructor(
    public count: number,
    public normal: number,
    entries: [number, number][] = [],
  ) {
    this.entries = [...entries].sort((a, b) => a[0] - b[0]);
    this.sizes = new Map(this.entries);
    let sum = 0;
    this.deltas = this.entries.map(([, size]) => (sum += size - normal));
  }
  size(i: number) {
    return this.sizes.get(i) ?? this.normal;
  }
  pos(i: number) {
    let lo = 0,
      hi = this.entries.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.entries[mid][0] < i) lo = mid + 1;
      else hi = mid;
    }
    return i * this.normal + (lo ? this.deltas[lo - 1] : 0);
  }
  at(pixel: number) {
    let lo = 0,
      hi = this.count;
    while (lo < hi) {
      const m = (lo + hi) >>> 1;
      if (this.pos(m) + this.size(m) <= pixel) lo = m + 1;
      else hi = m;
    }
    return Math.min(this.count - 1, Math.max(0, lo));
  }
  total() {
    return this.pos(this.count);
  }
}
export function quoteTsv(s: string) {
  return /[\t\n\r"]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
}
export function parseTsv(s: string) {
  const rows: string[][] = [[]];
  let part = "",
    quoted = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') {
      if (quoted && s[i + 1] === '"') {
        part += '"';
        i++;
      } else if (quoted || part === "") quoted = !quoted;
      else part += ch;
    } else if (!quoted && (ch === "\t" || ch === "\n" || ch === "\r")) {
      rows.at(-1)!.push(part);
      part = "";
      if (ch !== "\t") {
        if (ch === "\r" && s[i + 1] === "\n") i++;
        rows.push([]);
      }
    } else part += ch;
  }
  rows.at(-1)!.push(part);
  if (rows.length > 1 && rows.at(-1)!.length === 1 && rows.at(-1)![0] === "")
    rows.pop();
  return rows;
}

/** Lay out explicit newlines and optional wrapping, bounding work to visible lines. */
export function cellLines(
  text: string,
  width: number,
  measure: (text: string) => number,
  wrap: boolean,
  maxLines = 1000,
): string[] {
  const out: string[] = [];
  for (const paragraph of text.split(/\r\n|\r|\n/)) {
    if (out.length >= maxLines) break;
    if (!wrap) {
      out.push(paragraph);
      continue;
    }
    let line = "";
    for (const char of paragraph) {
      if (line && measure(line + char) > width) {
        out.push(line);
        line = "";
        if (out.length >= maxLines) return out;
      }
      line += char;
    }
    out.push(line);
  }
  return out;
}

/** Find the row/column ending within a screen-pixel tolerance of a header edge. */
export function resizeBoundary(
  axis: Axis,
  pixel: number,
  zoom: number,
  tolerance = 5,
): number | undefined {
  const i = axis.at(pixel);
  if (i > 0 && Math.abs(axis.pos(i) - pixel) * zoom <= tolerance) return i - 1;
  if (Math.abs(axis.pos(i + 1) - pixel) * zoom <= tolerance) return i;
  return undefined;
}
