import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
// Web bindings are copied to .mjs because the extension itself is CommonJS.
await writeFile(
  "engine/pkg/test-engine.mjs",
  await readFile("engine/pkg/canvas_xlsx_engine.js"),
);
const { default: init, Engine } = await import("../engine/pkg/test-engine.mjs");
await init({
  module_or_path: await readFile("engine/pkg/canvas_xlsx_engine_bg.wasm"),
});
const fixture = await readFile("test/basic.xlsx");
const req = (e, v) => JSON.parse(e.request(JSON.stringify({ sheet: 0, ...v })));
const get = (e) =>
  req(e, { op: "range", row: 0, column: 0, rows: 6, columns: 4 }).cells;
test("WASM load, edit, dependent recalc, undo/redo and save/reopen", () => {
  const e = new Engine(fixture);
  assert.equal(req(e, { op: "info" }).readonly, null);
  req(e, { op: "set", cells: [{ row: 1, column: 1, input: "12" }] });
  assert.equal(get(e).find((c) => c.row === 1 && c.column === 2).text, "24");
  assert.equal(get(e).find((c) => c.row === 3 && c.column === 1).text, "17");
  req(e, { op: "undo" });
  assert.equal(get(e).find((c) => c.row === 1 && c.column === 1).text, "10");
  req(e, { op: "redo" });
  const reopened = new Engine(e.save());
  assert.equal(
    get(reopened).find((c) => c.row === 1 && c.column === 2).text,
    "24",
  );
  reopened.free();
  e.free();
});
test("readonly advanced workbook cannot mutate and preserves original bytes", async () => {
  const data = await readFile("test/advanced.xlsx");
  const e = new Engine(data);
  assert.ok(req(e, { op: "info" }).readonly);
  assert.throws(() =>
    req(e, { op: "set", cells: [{ row: 0, column: 0, input: "x" }] }),
  );
  assert.deepEqual(Buffer.from(e.save()), data);
  e.free();
});
test("styles, literal text replacement and formula preservation", () => {
  const e = new Engine(fixture);
  req(e, {
    op: "format",
    row: 1,
    lastRow: 1,
    column: 0,
    lastColumn: 0,
    kind: "bold",
    value: true,
  });
  req(e, { op: "replace", query: "りんご", replacement: "梨", all: true });
  const reopened = new Engine(e.save());
  const cells = get(reopened);
  assert.equal(cells.find((c) => c.row === 1 && c.column === 0).text, "梨");
  assert.equal(cells.find((c) => c.row === 1 && c.column === 0).bold, true);
  assert.equal(cells.find((c) => c.row === 1 && c.column === 2).input, "=B2*2");
  e.free();
  reopened.free();
});
test("invalid ranges fail without dirtying workbook", () => {
  const e = new Engine(fixture);
  assert.throws(() =>
    req(e, { op: "range", row: 0, column: 0, rows: 100000, columns: 100000 }),
  );
  assert.equal(req(e, { op: "info" }).undo, 0);
  e.free();
});
test("internal clipboard keeps styles and shifts relative/absolute formula references", () => {
  const e = new Engine(fixture);
  req(e, { op: "set", cells: [{ row: 1, column: 2, input: "=B2+$B$2" }] });
  req(e, {
    op: "format",
    row: 1,
    lastRow: 1,
    column: 2,
    lastColumn: 2,
    kind: "bold",
    value: true,
  });
  const clip = req(e, {
    op: "copy",
    row: 1,
    lastRow: 1,
    column: 2,
    lastColumn: 2,
  });
  req(e, { op: "pasteInternal", text: clip.text, row: 2, column: 2 });
  const cell = get(e).find((c) => c.row === 2 && c.column === 2);
  assert.equal(cell.input, "=B3+$B$2");
  assert.equal(cell.bold, true);
  assert.equal(cell.text, "15");
  assert.throws(() =>
    req(e, { op: "pasteInternal", text: "external", row: 3, column: 2 }),
  );
  const r = new Engine(e.save());
  assert.equal(
    get(r).find((c) => c.row === 2 && c.column === 2).input,
    "=B3+$B$2",
  );
  r.free();
  e.free();
});
test("row/column insertion/deletion update formula references and survive save", () => {
  const e = new Engine(fixture);
  req(e, { op: "insert", axis: "rows", at: 1 });
  let cells = get(e);
  assert.equal(cells.find((c) => c.row === 2 && c.column === 2).input, "=B3*2");
  req(e, { op: "insert", axis: "columns", at: 0 });
  assert.equal(
    get(e).find((c) => c.row === 2 && c.column === 3).input,
    "=C3*2",
  );
  let r = new Engine(e.save());
  assert.equal(get(r).find((c) => c.row === 2 && c.column === 3).text, "20");
  r.free();
  req(e, { op: "delete", axis: "columns", at: 0 });
  req(e, { op: "delete", axis: "rows", at: 1 });
  r = new Engine(e.save());
  assert.equal(
    get(r).find((c) => c.row === 1 && c.column === 2).input,
    "=B2*2",
  );
  r.free();
  e.free();
});
test("sheet add/rename/reorder/delete and undo survive save", () => {
  const e = new Engine(fixture);
  req(e, { op: "addSheet", name: "補足" });
  req(e, {
    op: "set",
    sheet: 1,
    cells: [{ row: 0, column: 0, input: "='売上'!B2" }],
  });
  req(e, { op: "renameSheet", name: "売上実績" });
  assert.ok(
    req(e, {
      op: "range",
      sheet: 1,
      row: 0,
      column: 0,
      rows: 1,
      columns: 1,
    }).cells[0].input.includes("売上実績"),
  );
  req(e, { op: "moveSheet", sheet: 1, to: 0 });
  let r = new Engine(e.save());
  assert.equal(req(r, { op: "info" }).sheets[0].name, "補足");
  r.free();
  req(e, { op: "deleteSheet", sheet: 0 });
  assert.equal(req(e, { op: "info" }).sheets.length, 1);
  req(e, { op: "undo" });
  assert.equal(req(e, { op: "info" }).sheets.length, 2);
  r = new Engine(e.save());
  assert.equal(req(r, { op: "info" }).sheets.length, 2);
  r.free();
  e.free();
});
test("sizes and value filter persist; formula-containing sorts fail without changes", () => {
  const e = new Engine(fixture);
  req(e, { op: "size", axis: "columns", at: 0, pixels: 150 });
  req(e, {
    op: "filter",
    row: 0,
    lastRow: 2,
    column: 0,
    lastColumn: 1,
    filterColumn: 0,
    values: ["りんご"],
  });
  assert.ok(
    req(e, { op: "info" }).sheets[0].rowSizes.some(
      ([r, size]) => r === 2 && size === 0,
    ),
  );
  let r = new Engine(e.save());
  assert.ok(
    req(r, { op: "info" }).sheets[0].columnSizes.some(
      ([c, size]) => c === 0 && size === 150,
    ),
  );
  r.free();
  assert.throws(() =>
    req(e, {
      op: "sort",
      row: 1,
      lastRow: 2,
      column: 0,
      lastColumn: 1,
      sortColumn: 1,
      ascending: true,
    }),
  );
  req(e, { op: "filter", clear: true });
  r = new Engine(e.save());
  assert.ok(
    !req(r, { op: "info" }).sheets[0].rowSizes.some(
      ([r, size]) => r === 2 && size === 0,
    ),
  );
  r.free();
  e.free();
});
test("value-only sort, no-op replace, and unsupported formula reporting", () => {
  const e = new Engine(fixture);
  req(e, {
    op: "set",
    cells: [
      { row: 1, column: 2, input: "" },
      { row: 3, column: 1, input: "" },
    ],
  });
  req(e, {
    op: "sort",
    row: 1,
    lastRow: 2,
    column: 0,
    lastColumn: 1,
    sortColumn: 1,
    ascending: true,
  });
  assert.equal(
    get(e).find((c) => c.row === 1 && c.column === 0).text,
    "みかん",
  );
  const r = new Engine(e.save());
  assert.equal(get(r).find((c) => c.row === 1 && c.column === 1).text, "5");
  r.free();
  assert.equal(
    req(e, { op: "replace", query: "no-match", replacement: "x" }).changed,
    false,
  );
  req(e, {
    op: "set",
    cells: [{ row: 0, column: 2, input: "=UNKNOWNFUNCTION(1)" }],
  });
  const cell = get(e).find((c) => c.row === 0 && c.column === 2);
  assert.equal(cell.error, true);
  assert.equal(cell.input, "=UNKNOWNFUNCTION(1)");
  e.free();
});
test("independent workbook instances and Excel coordinate limits", () => {
  const a = new Engine(fixture),
    b = new Engine(fixture);
  req(a, { op: "set", cells: [{ row: 1, column: 1, input: "99" }] });
  assert.equal(get(b).find((c) => c.row === 1 && c.column === 1).text, "10");
  assert.throws(() =>
    req(a, { op: "set", cells: [{ row: 1048576, column: 0, input: "x" }] }),
  );
  assert.throws(() =>
    req(a, {
      op: "format",
      row: 0,
      lastRow: 4294967295,
      column: 0,
      lastColumn: 0,
      kind: "bold",
      value: true,
    }),
  );
  a.free();
  b.free();
});
test("declared ZIP expansion is rejected before decompression", () => {
  const bytes = Buffer.from(fixture);
  const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  bytes.writeUInt32LE(300 * 1024 * 1024, central + 24);
  assert.throws(() => new Engine(bytes), /256MiB/);
});

for (const name of ["shared-strings.xlsx", "shared-strings-custom.xlsx"])
  test(`existing shared strings support Japanese text edits, repeat saves and undo: ${name}`, async () => {
    const e = new Engine(await readFile(`test/${name}`));
    assert.equal(
      get(e).find((c) => c.row === 1 && c.column === 0).text,
      "りんご",
    );
    req(e, {
      op: "set",
      cells: [{ row: 1, column: 0, input: "新しいプロット：主人公の決断" }],
    });
    let saved = e.save();
    let reopened = new Engine(saved);
    assert.equal(
      get(reopened).find((c) => c.row === 1 && c.column === 0).text,
      "新しいプロット：主人公の決断",
    );
    assert.equal(
      get(reopened).find((c) => c.row === 2 && c.column === 0).text,
      "みかん",
    );
    reopened.free();
    req(e, { op: "set", cells: [{ row: 2, column: 0, input: "次の場面" }] });
    saved = e.save();
    reopened = new Engine(saved);
    assert.equal(
      get(reopened).find((c) => c.row === 2 && c.column === 0).text,
      "次の場面",
    );
    req(reopened, {
      op: "set",
      cells: [{ row: 0, column: 0, input: "再開後の編集" }],
    });
    const again = new Engine(reopened.save());
    assert.equal(
      get(again).find((c) => c.row === 0 && c.column === 0).text,
      "再開後の編集",
    );
    again.free();
    reopened.free();
    req(e, { op: "undo" });
    reopened = new Engine(e.save());
    assert.equal(
      get(reopened).find((c) => c.row === 2 && c.column === 0).text,
      "みかん",
    );
    reopened.free();
    e.free();
  });

test("multiline text, wrapping and row/column sizes survive save and undo", async () => {
  const e = new Engine(await readFile("test/shared-strings.xlsx"));
  const before = req(e, { op: "info" }).sheets[0];
  req(e, {
    op: "set",
    cells: [{ row: 1, column: 0, input: "一行目\n二行目\n三行目" }],
  });
  let cell = get(e).find((c) => c.row === 1 && c.column === 0);
  assert.equal(cell.text, "一行目\n二行目\n三行目");
  assert.equal(cell.wrap, true);
  assert.ok(
    req(e, { op: "info" }).sheets[0].rowSizes.find(([r]) => r === 1)[1] > 50,
  );
  req(e, { op: "undo" });
  assert.equal(
    get(e).find((c) => c.row === 1 && c.column === 0).text,
    "りんご",
  );
  assert.deepEqual(req(e, { op: "info" }).sheets[0].rowSizes, before.rowSizes);
  req(e, { op: "redo" });
  req(e, { op: "size", axis: "rows", at: 1, pixels: 90 });
  req(e, { op: "size", axis: "columns", at: 0, pixels: 240 });
  const r = new Engine(e.save());
  cell = get(r).find((c) => c.row === 1 && c.column === 0);
  assert.equal(cell.input, "一行目\n二行目\n三行目");
  assert.equal(cell.wrap, true);
  const info = req(r, { op: "info" }).sheets[0];
  assert.equal(info.rowSizes.find(([r]) => r === 1)[1], 90);
  assert.equal(info.columnSizes.find(([c]) => c === 0)[1], 240);
  r.free();
  e.free();
});
