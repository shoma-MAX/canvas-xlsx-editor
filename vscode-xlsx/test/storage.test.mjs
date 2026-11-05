import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";
await build({
  entryPoints: ["src/storage.ts"],
  outfile: "engine/pkg/storage.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
});
const { atomicSave, digest } = await import("../engine/pkg/storage.mjs");
test("atomic save detects external edits and leaves original plus no temp files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "canvas-save-"));
  try {
    const path = join(dir, "book.xlsx");
    await writeFile(path, "original");
    const hash = digest(Buffer.from("original"));
    await writeFile(path, "external");
    await assert.rejects(
      atomicSave(path, Buffer.from("edited"), hash),
      /外部で変更/,
    );
    assert.equal(await readFile(path, "utf8"), "external");
    assert.deepEqual(await readdir(dir), ["book.xlsx"]);
    await atomicSave(
      path,
      Buffer.from("edited"),
      digest(Buffer.from("external")),
    );
    assert.equal(await readFile(path, "utf8"), "edited");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
