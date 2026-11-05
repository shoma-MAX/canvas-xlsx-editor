import { Axis, parseTsv } from "./geometry";
declare function acquireVsCodeApi(): { postMessage: (v: unknown) => void };
declare global {
  interface Window {
    assets: { worker: string; wasm: string };
  }
}
const vscode =
  typeof acquireVsCodeApi === "function"
    ? acquireVsCodeApi()
    : { postMessage: (_: unknown) => {} };
const app = document.querySelector("#app")!;
app.innerHTML = `<style>
*{box-sizing:border-box}body{margin:0;color:var(--vscode-foreground,#d4d4d4);background:var(--vscode-editor-background,#1e1e1e);font:13px var(--vscode-font-family,system-ui)}button,select,input{font:inherit;color:inherit;background:var(--vscode-input-background,#303030);border:1px solid var(--vscode-panel-border,#454545);border-radius:3px;min-height:27px}button{padding:3px 9px;cursor:pointer}button:hover{background:var(--vscode-toolbar-hoverBackground,#454545)}button:disabled{opacity:.4;cursor:default}button:focus-visible,input:focus-visible,select:focus-visible{outline:1px solid var(--vscode-focusBorder,#007acc)}#app{height:100vh;display:flex;flex-direction:column}.toolbar{display:flex;align-items:center;gap:6px;padding:7px 12px;border-bottom:1px solid var(--vscode-panel-border,#454545);flex-wrap:wrap}.separator{width:1px;height:20px;background:var(--vscode-panel-border,#454545);margin:0 4px}.formula{display:flex;gap:10px;padding:6px 12px;border-bottom:1px solid var(--vscode-panel-border,#454545);align-items:center}#address{width:85px;text-align:center}#formula{flex:1;background:transparent;border:0;min-width:0;font-family:monospace}.fx{opacity:.5;font-style:italic}#status{padding:7px 12px;color:var(--vscode-descriptionForeground,#aaa);font-size:12px;border-bottom:1px solid var(--vscode-panel-border,#454545)}#status.error{color:var(--vscode-errorForeground,#f48771)}.grid{position:relative;flex:1;min-height:0;overflow:hidden}#scroll{position:absolute;inset:0;overflow:auto}#spacer{pointer-events:none}canvas{position:absolute;left:0;top:0;pointer-events:none}#editor{position:absolute;display:none;z-index:4;background:var(--vscode-input-background,#303030);border:2px solid var(--vscode-focusBorder,#007acc);border-radius:0;resize:none;padding:2px 5px;color:inherit;font:13px system-ui}footer{display:flex;align-items:center;gap:6px;border-top:1px solid var(--vscode-panel-border,#454545);padding:6px 12px}#tabs{flex:1;display:flex;gap:5px;overflow-x:auto}#tabs button.active{border-bottom:2px solid var(--vscode-focusBorder,#007acc)}footer a{color:var(--vscode-textLink-foreground,#75beff);font-size:11px;text-decoration:none}#zoom{width:90px}.panel{display:none;padding:8px 12px;gap:6px;border-bottom:1px solid var(--vscode-panel-border,#454545);align-items:center;flex-wrap:wrap}.panel.open{display:flex}.panel input{width:160px}#results{max-width:220px}#menu{position:fixed;display:none;z-index:8;padding:5px;background:var(--vscode-menu-background,#252526);border:1px solid #555;box-shadow:0 4px 15px #0006}#menu button{display:block;width:100%;text-align:left;background:transparent;border:0}#busy{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:var(--vscode-editor-background,#1e1e1e);z-index:10}.hint{opacity:.6;font-size:11px}
</style>
<div class="toolbar" role="toolbar" aria-label="セルの書式">
<button id="undo" title="元に戻す">↶</button><button id="redo" title="やり直す">↷</button><span class="separator"></span>
<button id="bold" data-edit title="太字"><b>B</b></button><label title="文字色">A <input id="color" data-edit type="color" value="#222222" aria-label="文字色" style="width:30px"></label><label title="背景色">塗 <input id="fill" data-edit type="color" value="#fff2cc" aria-label="背景色" style="width:30px"></label>
<select id="align" data-edit aria-label="文字揃え"><option value="left">左揃え</option><option value="center">中央揃え</option><option value="right">右揃え</option></select>
<select id="number" data-edit aria-label="数値形式"><option value="General">標準</option><option value="0">整数</option><option value="0.00">小数点2桁</option><option value="#,##0">桁区切り</option><option value="0%">パーセント</option><option value="yyyy/mm/dd">日付</option><option value="@">文字列</option></select><span class="separator"></span>
<button id="find">検索・置換</button><span class="hint">ダブルクリック / F2 で編集</span>
</div>
<div class="panel" id="searchPanel"><input id="query" placeholder="検索する文字列" aria-label="検索する文字列"><input id="replacement" placeholder="置換後の文字列" aria-label="置換後の文字列"><select id="scope" aria-label="検索範囲"><option value="sheet">現在のシート</option><option value="book">ブック全体</option></select><button id="search">検索</button><select id="results" aria-label="検索結果"><option>検索結果</option></select><button id="replace" data-edit>最初の一致を置換</button><button id="replaceAll" data-edit>すべて置換</button><button id="closeSearch" aria-label="検索を閉じる">×</button></div>
<div class="formula"><input id="address" value="A1" aria-label="セルへ移動"><span class="fx">fx</span><input id="formula" readonly aria-label="数式・セルの内容（表示専用）"></div>
<div id="status" role="status">XLSXを読み込んでいます…</div>
<div class="grid" id="grid"><div id="scroll" tabindex="0" role="grid" aria-label="ワークシート"><div id="spacer"></div></div><canvas id="canvas"></canvas><textarea id="editor" aria-label="セルの編集" spellcheck="false"></textarea><div id="busy">読み込み中…</div></div>
<footer><div id="tabs" role="tablist" aria-label="シート"></div><a href="https://github.com/ibisjp/ibis-office" target="_blank" rel="noopener">Powered by ibisOffice</a><select id="zoom" aria-label="ズーム"><option value=".5">50%</option><option value=".75">75%</option><option selected value="1">100%</option><option value="1.25">125%</option><option value="1.5">150%</option><option value="2">200%</option></select></footer><div id="menu" role="menu"></div>`;
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>("canvas"),
  ctx = canvas.getContext("2d")!,
  scroll = $("scroll"),
  editor = $<HTMLTextAreaElement>("editor");
type Cell = {
  row: number;
  column: number;
  text: string;
  input: string;
  bold: boolean;
  color: string;
  fill?: string;
  align: string;
  error: boolean;
};
let worker: Worker, workerUrl: string;
let wasmBytes: Promise<ArrayBuffer>;
let serial = 0;
const pending = new Map<
  number,
  { resolve: (v: any) => void; reject: (e: any) => void }
>();
let info: any,
  sheet = 0,
  zoom = 1,
  selected = { row: 0, column: 0 },
  anchor = { row: 0, column: 0 },
  cells = new Map<string, Cell>(),
  composing = false,
  dragging = false,
  loading = true;
let rowsAxis = new Axis(1000, 25),
  colsAxis = new Axis(26, 100);
let rangeGeneration = 0,
  frame = 0,
  clipboard:
    { text: string; cells: any[]; row: number; column: number } | undefined;
let editTarget = { row: 0, column: 0, sheet: 0 };
let editing = false,
  originalInput = "",
  mutationTail: Promise<void> = Promise.resolve(),
  lastMutationError: unknown;
const key = (r: number, c: number) => `${r}:${c}`;
const colName = (c: number) => {
  let s = "";
  for (c++; c; c = Math.floor((c - 1) / 26))
    s = String.fromCharCode(65 + ((c - 1) % 26)) + s;
  return s;
};
const bounds = () => ({
  row: Math.min(anchor.row, selected.row),
  column: Math.min(anchor.column, selected.column),
  lastRow: Math.max(anchor.row, selected.row),
  lastColumn: Math.max(anchor.column, selected.column),
});
const dims = () => ({
  cw: 100 * zoom,
  rh: 25 * zoom,
  hw: 52 * zoom,
  hh: 28 * zoom,
});
const extent = () => ({ rows: 1048576, columns: 16384 });
// Browser scroll extent stays below the browser's element-size limit.
const scale = () => {
  const d = dims(),
    e = extent();
  return {
    y: Math.max(1, (rowsAxis.total() * zoom) / 8_000_000),
    x: Math.max(1, (colsAxis.total() * zoom) / 8_000_000),
  };
};
const offset = () => {
  const s = scale();
  return { x: scroll.scrollLeft * s.x, y: scroll.scrollTop * s.y };
};
function status(text: string, error = false) {
  $("status").textContent = text;
  $("status").classList.toggle("error", error);
}
function rpc(op: string, args: any = {}): Promise<any> {
  const id = ++serial;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, op, sheet, ...args });
  });
}
function showError(e: unknown) {
  lastMutationError = e;
  status(String(e), true);
}
function layout() {
  const d = dims(),
    e = extent(),
    s = scale();
  $("spacer").style.width = `${(colsAxis.total() * zoom) / s.x + d.hw}px`;
  $("spacer").style.height = `${(rowsAxis.total() * zoom) / s.y + d.hh}px`;
  const g = $("grid").getBoundingClientRect(),
    ratio = devicePixelRatio || 1;
  canvas.width = Math.round(g.width * ratio);
  canvas.height = Math.round(g.height * ratio);
  canvas.style.width = `${g.width}px`;
  canvas.style.height = `${g.height}px`;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  schedule();
}
function schedule() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    draw();
    void refresh();
  });
}
function viewport() {
  const o = offset(),
    e = extent();
  const row = rowsAxis.at(o.y / zoom),
    column = colsAxis.at(o.x / zoom);
  return {
    row,
    column,
    rows: Math.min(
      e.rows - row,
      rowsAxis.at((o.y + canvas.clientHeight) / zoom) - row + 2,
    ),
    columns: Math.min(
      e.columns - column,
      colsAxis.at((o.x + canvas.clientWidth) / zoom) - column + 2,
    ),
  };
}
async function refresh() {
  if (loading) return;
  const gen = ++rangeGeneration;
  try {
    const v = await rpc("range", viewport());
    if (gen !== rangeGeneration) return;
    cells = new Map(v.cells.map((c: Cell) => [key(c.row, c.column), c]));
    draw();
  } catch (e) {
    showError(e);
  }
}
function draw() {
  const w = canvas.clientWidth,
    h = canvas.clientHeight,
    d = dims(),
    o = offset(),
    v = viewport(),
    e = extent();
  const style = getComputedStyle(document.body),
    bg =
      style.getPropertyValue("--vscode-editor-background").trim() || "#1e1e1e",
    fg = style.color,
    line = style.getPropertyValue("--vscode-panel-border").trim() || "#454545",
    focus = style.getPropertyValue("--vscode-focusBorder").trim() || "#007acc";
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.font = `${13 * zoom}px system-ui`;
  ctx.textBaseline = "middle";
  for (let r = v.row; r < Math.min(e.rows, v.row + v.rows); r++)
    for (let c = v.column; c < Math.min(e.columns, v.column + v.columns); c++) {
      const cw = colsAxis.size(c) * zoom,
        rh = rowsAxis.size(r) * zoom;
      const x = d.hw + colsAxis.pos(c) * zoom - o.x,
        y = d.hh + rowsAxis.pos(r) * zoom - o.y;
      if (!cw || !rh) continue;
      if (x + cw < d.hw || y + rh < d.hh) continue;
      const cell = cells.get(key(r, c));
      if (cell?.fill) {
        ctx.fillStyle = cell.fill;
        ctx.fillRect(x, y, cw, rh);
      }
      ctx.strokeStyle = line;
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x, y, cw, rh);
      if (cell) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(Math.max(d.hw, x) + 2, Math.max(d.hh, y), cw - 4, rh);
        ctx.clip();
        ctx.font = `${cell.bold ? "bold " : ""}${13 * zoom}px system-ui`;
        ctx.fillStyle = cell.error
          ? "#f48771"
          : cell.color === "#000000" && !cell.fill
            ? fg
            : cell.color;
        ctx.textAlign =
          cell.align === "Right"
            ? "right"
            : cell.align === "Center"
              ? "center"
              : "left";
        ctx.fillText(
          cell.text,
          cell.align === "Right"
            ? x + cw - 6
            : cell.align === "Center"
              ? x + cw / 2
              : x + 6,
          y + rh / 2,
        );
        ctx.restore();
      }
    }
  const b = bounds(),
    x = d.hw + colsAxis.pos(b.column) * zoom - o.x,
    y = d.hh + rowsAxis.pos(b.row) * zoom - o.y;
  ctx.save();
  ctx.beginPath();
  ctx.rect(d.hw, d.hh, w - d.hw, h - d.hh);
  ctx.clip();
  ctx.fillStyle = focus + "22";
  ctx.fillRect(
    x,
    y,
    (colsAxis.pos(b.lastColumn + 1) - colsAxis.pos(b.column)) * zoom,
    (rowsAxis.pos(b.lastRow + 1) - rowsAxis.pos(b.row)) * zoom,
  );
  ctx.strokeStyle = focus;
  ctx.lineWidth = 2;
  ctx.strokeRect(
    x + 1,
    y + 1,
    (colsAxis.pos(b.lastColumn + 1) - colsAxis.pos(b.column)) * zoom - 2,
    (rowsAxis.pos(b.lastRow + 1) - rowsAxis.pos(b.row)) * zoom - 2,
  );
  ctx.restore();
  ctx.fillStyle =
    style
      .getPropertyValue("--vscode-editorGroupHeader-tabsBackground")
      .trim() || "#292929";
  ctx.fillRect(0, 0, w, d.hh);
  ctx.fillRect(0, 0, d.hw, h);
  ctx.fillStyle = fg;
  ctx.font = `${11 * zoom}px system-ui`;
  ctx.textAlign = "center";
  for (let c = v.column; c < Math.min(e.columns, v.column + v.columns); c++) {
    const cw = colsAxis.size(c) * zoom;
    const x = d.hw + colsAxis.pos(c) * zoom - o.x;
    ctx.save();
    ctx.beginPath();
    ctx.rect(d.hw, 0, w - d.hw, d.hh);
    ctx.clip();
    ctx.fillText(colName(c), x + cw / 2, d.hh / 2);
    ctx.restore();
  }
  for (let r = v.row; r < Math.min(e.rows, v.row + v.rows); r++) {
    const rh = rowsAxis.size(r) * zoom;
    const y = d.hh + rowsAxis.pos(r) * zoom - o.y;
    if (rh && y >= d.hh) ctx.fillText(String(r + 1), d.hw / 2, y + rh / 2);
  }
  $("address").setAttribute(
    "aria-label",
    `選択セル ${colName(selected.column)}${selected.row + 1}`,
  );
  $<HTMLInputElement>("address").value =
    `${colName(selected.column)}${selected.row + 1}`;
  $<HTMLInputElement>("formula").value =
    cells.get(key(selected.row, selected.column))?.input || "";
}
function select(r: number, c: number, extend = false) {
  const e = extent();
  selected = {
    row: Math.min(e.rows - 1, Math.max(0, r)),
    column: Math.min(e.columns - 1, Math.max(0, c)),
  };
  if (!extend) anchor = { ...selected };
  draw();
}
function reveal() {
  const d = dims(),
    o = offset(),
    s = scale(),
    x = colsAxis.pos(selected.column) * zoom,
    y = rowsAxis.pos(selected.row) * zoom;
  if (x < o.x) scroll.scrollLeft = x / s.x;
  else if (
    x + colsAxis.size(selected.column) * zoom >
    o.x + canvas.clientWidth - d.hw
  )
    scroll.scrollLeft =
      (x + colsAxis.size(selected.column) * zoom - canvas.clientWidth + d.hw) /
      s.x;
  if (y < o.y) scroll.scrollTop = y / s.y;
  else if (
    y + rowsAxis.size(selected.row) * zoom >
    o.y + canvas.clientHeight - d.hh
  )
    scroll.scrollTop =
      (y + rowsAxis.size(selected.row) * zoom - canvas.clientHeight + d.hh) /
      s.y;
  schedule();
}
function point(e: MouseEvent) {
  const rect = scroll.getBoundingClientRect(),
    d = dims(),
    o = offset();
  if (e.clientY - rect.top < d.hh || e.clientX - rect.left < d.hw)
    return { row: -1, column: -1 };
  return {
    row: rowsAxis.at((e.clientY - rect.top - d.hh + o.y) / zoom),
    column: colsAxis.at((e.clientX - rect.left - d.hw + o.x) / zoom),
  };
}
function renderInfo(v: any) {
  info = v;
  sheet = Math.min(sheet, v.sheets.length - 1);
  const sh = v.sheets[sheet];
  rowsAxis = new Axis(extent().rows, sh.defaultRow, sh.rowSizes);
  colsAxis = new Axis(extent().columns, sh.defaultColumn, sh.columnSizes);
  $<HTMLButtonElement>("undo").disabled = !v.canUndo;
  $<HTMLButtonElement>("redo").disabled = !v.canRedo;
  $("tabs").replaceChildren();
  v.sheets.forEach((s: any, i: number) => {
    const b = document.createElement("button");
    b.textContent = s.name || `Sheet${i + 1}`;
    b.classList.toggle("active", i === sheet);
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(i === sheet));
    b.onclick = () => {
      void switchSheet(i);
    };
    b.draggable = !v.readonly;
    b.ondragstart = (e) => {
      e.dataTransfer?.setData("application/x-canvas-sheet", String(i));
    };
    b.ondragover = (e) => e.preventDefault();
    b.ondrop = (e) => {
      e.preventDefault();
      const from = e.dataTransfer?.getData("application/x-canvas-sheet");
      if (from)
        void mutate(
          "moveSheet",
          { sheet: Number(from), to: i },
          "シートの並べ替え",
        ).catch(showError);
    };
    $("tabs").append(b);
  });
  document
    .querySelectorAll<HTMLButtonElement>("[data-edit]")
    .forEach((e) => (e.disabled = !!v.readonly));
  status(
    v.readonly || "セル編集・基本書式・検索置換に対応  ·  保存: Cmd/Ctrl+S",
  );
}
async function switchSheet(i: number) {
  await commit();
  await mutationTail;
  sheet = i;
  select(0, 0);
  scroll.scrollTop = scroll.scrollLeft = 0;
  cells.clear();
  renderInfo(info);
  layout();
}
function mutate(op: string, args: any = {}, label = "セル編集"): Promise<void> {
  const targetSheet = sheet;
  const task = mutationTail.then(async () => {
    lastMutationError = undefined;
    const v = await rpc(op, { sheet: targetSheet, ...args });
    if (v.sheets) renderInfo(v);
    if (v.changed) vscode.postMessage({ type: "edit", label });
    layout();
    await refresh();
  });
  mutationTail = task.catch(showError);
  return task;
}
function begin(initial?: string) {
  if (loading || info.readonly) return;
  const d = dims(),
    o = offset();
  editor.style.left = `${d.hw + colsAxis.pos(selected.column) * zoom - o.x}px`;
  editor.style.top = `${d.hh + rowsAxis.pos(selected.row) * zoom - o.y}px`;
  editor.style.width = `${colsAxis.size(selected.column) * zoom}px`;
  editor.style.height = `${rowsAxis.size(selected.row) * zoom}px`;
  editTarget = { ...selected, sheet };
  originalInput = cells.get(key(selected.row, selected.column))?.input ?? "";
  editor.value = initial ?? originalInput;
  editor.style.display = "block";
  editing = true;
  editor.focus();
  if (initial === undefined) editor.select();
}
async function commit() {
  if (!editing) return;
  if (composing)
    throw new Error("日本語入力の変換を確定してから保存してください");
  editing = false;
  editor.style.display = "none";
  const input = editor.value;
  if (input === originalInput) return;
  await mutate("set", {
    sheet: editTarget.sheet,
    cells: [{ row: editTarget.row, column: editTarget.column, input }],
  });
}
editor.addEventListener("compositionstart", () => {
  composing = true;
});
editor.addEventListener("compositionend", () => {
  composing = false;
});
editor.addEventListener("keydown", (e) => {
  if (composing || e.isComposing || e.keyCode === 229) return;
  if (e.key === "Escape") {
    editing = false;
    editor.style.display = "none";
    scroll.focus();
    e.preventDefault();
  }
  if (e.key === "Enter" || e.key === "Tab") {
    e.preventDefault();
    void commit()
      .then(() => {
        select(
          selected.row + (e.key === "Enter" ? 1 : 0),
          selected.column + (e.key === "Tab" ? 1 : 0),
        );
        reveal();
        scroll.focus();
      })
      .catch(showError);
  }
});
editor.addEventListener("blur", () => {
  if (!composing) void commit().catch(showError);
});
scroll.addEventListener("scroll", () => {
  if (editing) void commit().catch(showError);
  schedule();
});
scroll.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  const p = point(e);
  if (p.row < 0 || p.column < 0) return;
  select(p.row, p.column, e.shiftKey);
  dragging = true;
  scroll.focus();
});
scroll.addEventListener("mousemove", (e) => {
  if (dragging) {
    const p = point(e);
    select(p.row, p.column, true);
  }
});
window.addEventListener("mouseup", () => {
  dragging = false;
});
scroll.addEventListener("dblclick", () => {
  void begin();
});
scroll.addEventListener("keydown", (e) => {
  if (loading) return;
  if (e.key === "Process" || e.keyCode === 229) {
    begin("");
    return;
  }
  const mod = e.ctrlKey || e.metaKey;
  if (mod && ["z", "y"].includes(e.key.toLowerCase())) {
    e.preventDefault();
    vscode.postMessage({
      type: e.shiftKey || e.key.toLowerCase() === "y" ? "redo" : "undo",
    });
    return;
  }
  if (mod && e.key.toLowerCase() === "f") {
    e.preventDefault();
    $("searchPanel").classList.add("open");
    $("query").focus();
    return;
  }
  if (e.key === "F2") {
    e.preventDefault();
    void begin();
    return;
  }
  const moves: Record<string, [number, number]> = {
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
    Enter: [1, 0],
    Tab: [0, e.shiftKey ? -1 : 1],
  };
  if (moves[e.key]) {
    e.preventDefault();
    const [r, c] = moves[e.key];
    select(
      selected.row + r,
      selected.column + c,
      e.shiftKey && e.key !== "Tab",
    );
    reveal();
    return;
  }
  if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    const b = bounds(),
      list = [];
    if ((b.lastRow - b.row + 1) * (b.lastColumn - b.column + 1) > 100000) {
      showError("選択範囲が大きすぎます");
      return;
    }
    for (let r = b.row; r <= b.lastRow; r++)
      for (let c = b.column; c <= b.lastColumn; c++)
        list.push({ row: r, column: c, input: "" });
    void mutate("set", { cells: list }, "クリア").catch(showError);
    return;
  }
  if (!mod && !e.altKey && e.key.length === 1) {
    e.preventDefault();
    void begin(e.key);
  }
});
scroll.addEventListener("copy", (e) => {
  e.preventDefault();
  void (async () => {
    const v = await rpc("copy", bounds());
    await navigator.clipboard.writeText(v.text);
    clipboard = { text: v.text, cells: [], row: 0, column: 0 };
    status("コピーしました");
  })().catch(showError);
});
scroll.addEventListener("paste", (e) => {
  e.preventDefault();
  const text = e.clipboardData?.getData("text/plain");
  if (text === undefined) return;
  if (clipboard?.text === text) {
    void mutate("pasteInternal", { text, ...selected }, "貼り付け").catch(
      showError,
    );
    return;
  }
  clipboard = undefined;
  const rows = parseTsv(text);
  if (rows.reduce((n, r) => n + r.length, 0) > 100000) {
    showError("貼り付け範囲が大きすぎます");
    return;
  }
  const list = rows.flatMap((r, ri) =>
    r.map((input, ci) => ({
      row: selected.row + ri,
      column: selected.column + ci,
      input,
    })),
  );
  void mutate("set", { cells: list }, "貼り付け").catch(showError);
});
$("bold").onclick = () => {
  void mutate(
    "format",
    {
      ...bounds(),
      kind: "bold",
      value: !cells.get(key(selected.row, selected.column))?.bold,
    },
    "書式変更",
  ).catch(showError);
};
for (const kind of ["color", "fill", "align", "number"])
  $<HTMLInputElement>(kind).onchange = (e) => {
    void mutate(
      "format",
      { ...bounds(), kind, value: (e.target as HTMLInputElement).value },
      "書式変更",
    ).catch(showError);
  };
$("undo").onclick = () => vscode.postMessage({ type: "undo" });
$("redo").onclick = () => vscode.postMessage({ type: "redo" });
$("find").onclick = () => {
  $("searchPanel").classList.toggle("open");
  $("query").focus();
};
$("closeSearch").onclick = () => {
  $("searchPanel").classList.remove("open");
  scroll.focus();
};
const searchArgs = () => ({
  query: $<HTMLInputElement>("query").value,
  all: $<HTMLSelectElement>("scope").value === "book",
});
$("search").onclick = async () => {
  try {
    const v = await rpc("search", searchArgs());
    const list = $<HTMLSelectElement>("results");
    list.replaceChildren();
    for (const hit of v.results) {
      const o = document.createElement("option");
      o.textContent = `${info.sheets[hit.sheet].name}!${colName(hit.column)}${hit.row + 1} ${hit.text}`;
      o.value = JSON.stringify(hit);
      list.append(o);
    }
    status(`${v.results.length}件（最大1000件）`);
    if (v.results.length) list.dispatchEvent(new Event("change"));
  } catch (e) {
    showError(e);
  }
};
$("results").onchange = async () => {
  const val = $<HTMLSelectElement>("results").value;
  if (!val) return;
  const hit = JSON.parse(val);
  if (hit.sheet !== sheet) await switchSheet(hit.sheet);
  select(hit.row, hit.column);
  reveal();
};
for (const [id, one] of [
  ["replace", true],
  ["replaceAll", false],
] as const)
  $(id).onclick = () => {
    void mutate(
      "replace",
      {
        ...searchArgs(),
        replacement: $<HTMLInputElement>("replacement").value,
        one,
      },
      "文字列置換",
    ).catch(showError);
  };
$<HTMLSelectElement>("zoom").onchange = () => {
  zoom = Number($<HTMLSelectElement>("zoom").value);
  layout();
  reveal();
};
$("address").onkeydown = (e) => {
  if (e.key !== "Enter") return;
  const match = /^([A-Za-z]+)([1-9][0-9]*)$/.exec(
    $<HTMLInputElement>("address").value,
  );
  if (!match) {
    showError("A1形式のセル番地を入力してください");
    return;
  }
  let c = 0;
  for (const ch of match[1].toUpperCase()) c = c * 26 + ch.charCodeAt(0) - 64;
  select(Number(match[2]) - 1, c - 1);
  reveal();
  scroll.focus();
};
scroll.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  const menu = $("menu");
  menu.replaceChildren();
  const action = (label: string, fn: () => void) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.disabled = !!info?.readonly;
    b.onclick = () => {
      fn();
      menu.style.display = "none";
    };
    menu.append(b);
  };
  for (const axis of ["rows", "columns"]) {
    const label = axis === "rows" ? "行" : "列",
      at = axis === "rows" ? selected.row : selected.column;
    action(`${label}を挿入`, () => {
      void mutate("insert", { axis, at }, `${label}の挿入`).catch(showError);
    });
    action(`${label}を削除`, () => {
      void mutate("delete", { axis, at }, `${label}の削除`).catch(showError);
    });
    action(`${label}の${axis === "rows" ? "高さ" : "幅"}…`, () => {
      showInput(`${label}のサイズ（px）`, "25", (value) =>
        mutate("size", { axis, at, pixels: Number(value) }, "サイズ変更"),
      );
    });
  }
  action("シートを追加…", () =>
    showInput("新しいシート名", "Sheet" + (info.sheets.length + 1), (name) =>
      mutate("addSheet", { name }, "シート追加"),
    ),
  );
  action("シート名を変更…", () =>
    showInput("シート名", info.sheets[sheet].name, (name) =>
      mutate("renameSheet", { name }, "シート名変更"),
    ),
  );
  action("シートを削除…", () =>
    showConfirm("現在のシートを削除します。Undoで戻せます。", () =>
      mutate("deleteSheet", {}, "シート削除"),
    ),
  );
  for (const ascending of [true, false])
    action(ascending ? "選択範囲を昇順ソート" : "選択範囲を降順ソート", () => {
      void mutate(
        "sort",
        { ...bounds(), sortColumn: selected.column, ascending, header: false },
        "ソート",
      ).catch(showError);
    });
  action("選択列を値でフィルター…", () =>
    showInput(
      "表示する値（改行で複数指定）。選択範囲の先頭行は見出しです。",
      "",
      (value) =>
        mutate(
          "filter",
          {
            ...bounds(),
            filterColumn: selected.column,
            values: value.split("\n"),
          },
          "フィルター",
        ),
    ),
  );
  action("フィルターを解除", () => {
    void mutate("filter", { clear: true }, "フィルター解除").catch(showError);
  });
  menu.style.left = `${Math.min(e.clientX, innerWidth - 260)}px`;
  menu.style.top = `${Math.max(0, Math.min(e.clientY, innerHeight - 430))}px`;
  menu.style.display = "block";
});
window.addEventListener("click", () => {
  $("menu").style.display = "none";
});
// Webviews disable prompt()/confirm(); use a real DOM dialog.
function showInput(
  label: string,
  value: string,
  apply: (v: string) => Promise<void>,
) {
  const dialog = document.createElement("dialog");
  dialog.style.cssText =
    "color:inherit;background:var(--vscode-editor-background,#222);border:1px solid #666;max-width:420px";
  const title = document.createElement("p");
  title.textContent = label;
  const input = document.createElement("textarea");
  input.value = value;
  input.style.cssText = "width:100%;height:70px";
  const ok = document.createElement("button");
  ok.textContent = "適用";
  const cancel = document.createElement("button");
  cancel.textContent = "キャンセル";
  ok.onclick = () => {
    const text = input.value;
    dialog.close();
    dialog.remove();
    void apply(text).catch(showError);
  };
  cancel.onclick = () => {
    dialog.close();
    dialog.remove();
  };
  dialog.append(title, input, ok, cancel);
  document.body.append(dialog);
  dialog.showModal();
  input.focus();
  input.select();
}
function showConfirm(label: string, apply: () => Promise<void>) {
  showInput(label + " 続行するには「削除」と入力してください。", "", (v) =>
    v === "削除" ? apply() : Promise.resolve(),
  );
}
new ResizeObserver(layout).observe($("grid"));
async function load(bytes: number[]) {
  loading = true;
  $("busy").style.display = "flex";
  try {
    const v = await rpc("load", { bytes, wasmBytes: await wasmBytes });
    sheet = 0;
    cells.clear();
    loading = false;
    renderInfo(v);
    layout();
    await refresh();
    $("busy").style.display = "none";
    scroll.focus();
  } catch (e) {
    $("busy").textContent = "読み込みに失敗しました";
    showError(e);
    throw e;
  }
}
window.addEventListener("message", async (e) => {
  const m = e.data;
  if (m.type === "load") {
    if (m.wasmBase64)
      wasmBytes = Promise.resolve(
        Uint8Array.from(atob(m.wasmBase64), (c) => c.charCodeAt(0)).buffer,
      );
    else if (m.wasmBytes)
      wasmBytes = Promise.resolve(new Uint8Array(m.wasmBytes).buffer);
    void load(
      m.bytesBase64
        ? Array.from(
            Uint8Array.from(atob(m.bytesBase64), (c) => c.charCodeAt(0)),
          )
        : m.bytes,
    ).catch(() => {});
    return;
  }
  if (m.type !== "rpc") return;
  try {
    let result: any;
    if (m.op === "save") {
      await commit();
      await mutationTail;
      result = Array.from(await rpc("save"));
    } else if (m.op === "reload") {
      await load(m.bytes);
      result = null;
    } else {
      await mutationTail;
      result = await rpc(m.op);
      renderInfo(result);
      await refresh();
    }
    vscode.postMessage({ type: "reply", id: m.id, result });
  } catch (error) {
    vscode.postMessage({ type: "reply", id: m.id, error: String(error) });
    showError(error);
  }
});
async function start() {
  try {
    const source = await (await fetch(window.assets.worker)).text();
    workerUrl = URL.createObjectURL(
      new Blob([source], { type: "text/javascript" }),
    );
    worker = new Worker(workerUrl);
    worker.onmessage = (e) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      e.data.error
        ? p.reject(new Error(e.data.error))
        : p.resolve(e.data.result);
    };
    worker.onerror = (e) => {
      for (const p of pending.values())
        p.reject(new Error(e.message || "Workerを開始できません"));
      pending.clear();
      showError(e.message || "Workerを開始できません");
    };
    vscode.postMessage({ type: "ready" });
  } catch (e) {
    showError(e);
  }
}
window.addEventListener("unload", () => {
  worker?.terminate();
  URL.revokeObjectURL(workerUrl);
});
void start();
