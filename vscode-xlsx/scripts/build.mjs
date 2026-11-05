import { build } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";
await mkdir("dist", { recursive: true });
await build({
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.js",
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["vscode"],
});
await build({
  entryPoints: ["webview/main.ts"],
  outfile: "dist/main.js",
  bundle: true,
  platform: "browser",
  format: "iife",
});
await build({
  entryPoints: ["webview/worker.ts"],
  outfile: "dist/worker.js",
  bundle: true,
  platform: "browser",
  format: "iife",
  define: { "import.meta.url": JSON.stringify("") },
});
await copyFile("engine/pkg/canvas_xlsx_engine_bg.wasm", "dist/engine.wasm");
await copyFile("../LICENSE", "LICENSE");
await copyFile("../NOTICE", "NOTICE");
