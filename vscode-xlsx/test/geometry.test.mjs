import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
await build({
  entryPoints: ["webview/geometry.ts"],
  outfile: "engine/pkg/geometry.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
});
const { Axis, parseTsv, quoteTsv } = await import("../engine/pkg/geometry.mjs");
test("sparse layout handles hidden rows and maximum Excel coordinate", () => {
  const a = new Axis(1048576, 25, [
    [1, 50],
    [2, 0],
  ]);
  assert.equal(a.pos(3), 75);
  assert.equal(a.at(74), 1);
  assert.equal(a.at(75), 3);
  assert.equal(a.at(a.total() - 1), 1048575);
});
test("TSV round trip preserves embedded tabs/newlines/quotes and CRLF", () => {
  const row = ["a\tb", "line\nbreak", '"quoted"', ""];
  assert.deepEqual(parseTsv(row.map(quoteTsv).join("\t")), [row]);
  assert.deepEqual(parseTsv("a\tb\r\nc\td\r\n"), [
    ["a", "b"],
    ["c", "d"],
  ]);
});

test("multiline layout preserves blank lines and wraps Japanese within visible height", async () => {
  const { cellLines } = await import("../engine/pkg/geometry.mjs");
  assert.deepEqual(
    cellLines("一行\n\n三行", 100, (s) => s.length * 10, false),
    ["一行", "", "三行"],
  );
  assert.deepEqual(
    cellLines("あいうえお", 20, (s) => s.length * 10, true),
    ["あい", "うえ", "お"],
  );
  assert.deepEqual(
    cellLines("あいうえお", 20, (s) => s.length * 10, true, 2),
    ["あい", "うえ"],
  );
});
test("header resizing hit tests account for zoom and sparse variable sizes", async () => {
  const { resizeBoundary } = await import("../engine/pkg/geometry.mjs");
  const a = new Axis(20, 100, [[0, 150]]);
  assert.equal(resizeBoundary(a, 149, 2), 0);
  assert.equal(resizeBoundary(a, 152, 2), 0);
  assert.equal(resizeBoundary(a, 154, 2), undefined);
  assert.equal(resizeBoundary(a, 250, 1), 1);
  assert.equal(resizeBoundary(a, 0, 1), undefined);
});
