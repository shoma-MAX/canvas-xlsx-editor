import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm, unlink } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import vm from "node:vm";
class Uri {
  constructor(path) {
    this.fsPath = path;
    this.scheme = "file";
  }
  toString() {
    return pathToFileURL(this.fsPath).href;
  }
  static parse(s) {
    return new Uri(fileURLToPath(s));
  }
  static joinPath(u, ...p) {
    return new Uri(join(u.fsPath, ...p));
  }
}
class Emitter {
  listeners = [];
  event = (f) => {
    this.listeners.push(f);
    return { dispose() {} };
  };
  fire(v) {
    this.listeners.forEach((f) => f(v));
  }
  dispose() {}
}
test("provider save, save-as, backup recovery and revert lifecycle", async () => {
  let provider;
  const vscode = {
    Uri,
    EventEmitter: Emitter,
    workspace: {
      fs: {
        readFile: (u) => readFile(u.fsPath),
        writeFile: (u, b) => writeFile(u.fsPath, b),
        delete: (u) => unlink(u.fsPath),
      },
    },
    window: {
      registerCustomEditorProvider: (_, p) => {
        provider = p;
        return { dispose() {} };
      },
    },
    commands: {},
  };
  const exports = {};
  const mod = { exports };
  vm.runInNewContext(await readFile("dist/extension.js", "utf8"), {
    exports,
    module: mod,
    require: (name) =>
      name === "vscode" ? vscode : process.getBuiltinModule(name),
    Buffer,
    setTimeout,
    clearTimeout,
    console,
  });
  mod.exports.activate({
    subscriptions: [],
    extensionUri: new Uri(process.cwd()),
  });
  const dir = await mkdtemp(join(tmpdir(), "canvas-provider-"));
  try {
    const path = join(dir, "book.xlsx"),
      target = join(dir, "copy.xlsx"),
      backup = join(dir, "backup");
    await writeFile(path, "original");
    const doc = await provider.openCustomDocument(new Uri(path), {});
    const calls = [];
    doc.rpc = async (op, args) => {
      calls.push({ op, args });
      return Array.from(Buffer.from("edited"));
    };
    const token = { isCancellationRequested: false };
    await provider.saveCustomDocument(doc, token);
    assert.equal(await readFile(path, "utf8"), "edited");
    await provider.saveCustomDocumentAs(doc, new Uri(target), token);
    assert.equal(await readFile(target, "utf8"), "edited");
    const snapshot = await provider.backupCustomDocument(
      doc,
      { destination: new Uri(backup) },
      token,
    );
    const restored = await provider.openCustomDocument(new Uri(path), {
      backupId: snapshot.id,
    });
    assert.equal(Buffer.from(restored.bytes).toString(), "edited");
    await writeFile(path, "external");
    await assert.rejects(provider.saveCustomDocument(doc, token), /外部で変更/);
    await provider.revertCustomDocument(doc);
    assert.equal(calls.at(-1).op, "reload");
    assert.equal(Buffer.from(calls.at(-1).args.bytes).toString(), "external");
    doc.dispose();
    restored.dispose();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
