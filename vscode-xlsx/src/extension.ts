import * as vscode from "vscode";
import { randomBytes } from "node:crypto";
import { atomicSave, digest } from "./storage";
class Book implements vscode.CustomDocument {
  readonly uri: vscode.Uri;
  bytes: Uint8Array;
  diskHash: string;
  panel?: vscode.WebviewPanel;
  private pending = new Map<
    number,
    {
      resolve: (v: any) => void;
      reject: (e: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();
  private seq = 0;
  private disposed = new vscode.EventEmitter<void>();
  readonly onDidDispose = this.disposed.event;
  constructor(uri: vscode.Uri, bytes: Uint8Array, hash: string) {
    this.uri = uri;
    this.bytes = bytes;
    this.diskHash = hash;
  }
  rpc(op: string, data: any = {}): Promise<any> {
    if (!this.panel) return Promise.reject(new Error("エディタが閉じています"));
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(
            "処理がタイムアウトしました。元ファイルは変更されていません。",
          ),
        );
      }, 120000);
      this.pending.set(id, { resolve, reject, timer });
      void this.panel!.webview.postMessage({ type: "rpc", id, op, ...data });
    });
  }
  reply(message: any) {
    const p = this.pending.get(message.id);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(message.id);
    message.error
      ? p.reject(new Error(message.error))
      : p.resolve(message.result);
  }
  dispose() {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error("エディタが閉じられました"));
    }
    this.pending.clear();
    this.disposed.fire();
    this.disposed.dispose();
  }
}
class Provider implements vscode.CustomEditorProvider<Book> {
  private changed = new vscode.EventEmitter<
    vscode.CustomDocumentEditEvent<Book>
  >();
  readonly onDidChangeCustomDocument = this.changed.event;
  constructor(private context: vscode.ExtensionContext) {}
  async openCustomDocument(
    uri: vscode.Uri,
    ctx: vscode.CustomDocumentOpenContext,
  ): Promise<Book> {
    if (uri.scheme !== "file")
      throw new Error("初期版はローカルXLSXファイルに対応しています");
    const disk = await vscode.workspace.fs.readFile(uri);
    const bytes = ctx.backupId
      ? await vscode.workspace.fs.readFile(vscode.Uri.parse(ctx.backupId))
      : disk;
    return new Book(uri, bytes, digest(disk));
  }
  async resolveCustomEditor(doc: Book, panel: vscode.WebviewPanel) {
    doc.panel = panel;
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, "dist"),
      ],
    };
    panel.webview.onDidReceiveMessage(async (m) => {
      try {
        if (m.type === "ready")
          await panel.webview.postMessage({
            type: "load",
            bytesBase64: Buffer.from(doc.bytes).toString("base64"),
            wasmBase64: Buffer.from(
              await vscode.workspace.fs.readFile(
                vscode.Uri.joinPath(
                  this.context.extensionUri,
                  "dist",
                  "engine.wasm",
                ),
              ),
            ).toString("base64"),
          });
        if (m.type === "reply") doc.reply(m);
        if (m.type === "edit")
          this.changed.fire({
            document: doc,
            label: m.label || "セル編集",
            undo: () => doc.rpc("undo").then(() => {}),
            redo: () => doc.rpc("redo").then(() => {}),
          });
        if (m.type === "undo" || m.type === "redo")
          await vscode.commands.executeCommand(m.type);
        if (m.type === "error")
          void vscode.window.showErrorMessage(`Canvas XLSX: ${m.error}`);
      } catch (e) {
        void vscode.window.showErrorMessage(String(e));
      }
    });
    panel.onDidDispose(() => {
      doc.panel = undefined;
    });
    const nonce = randomBytes(16).toString("hex");
    const asset = (name: string) =>
      panel.webview.asWebviewUri(
        vscode.Uri.joinPath(this.context.extensionUri, "dist", name),
      );
    panel.webview.html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' 'wasm-unsafe-eval'; worker-src blob:; connect-src ${panel.webview.cspSource}; style-src 'unsafe-inline';"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Canvas XLSX Editor</title></head><body><div id="app"></div><script nonce="${nonce}">window.assets=${JSON.stringify({ worker: asset("worker.js").toString(), wasm: asset("engine.wasm").toString() })};</script><script nonce="${nonce}" src="${asset("main.js")}"></script></body></html>`;
  }
  async saveCustomDocument(doc: Book, token: vscode.CancellationToken) {
    const bytes = new Uint8Array(await doc.rpc("save"));
    if (token.isCancellationRequested) return;
    doc.diskHash = await atomicSave(doc.uri.fsPath, bytes, doc.diskHash);
    doc.bytes = bytes;
  }
  async saveCustomDocumentAs(
    doc: Book,
    target: vscode.Uri,
    token: vscode.CancellationToken,
  ) {
    if (target.scheme !== "file")
      throw new Error("ローカルファイルへ保存してください");
    const bytes = new Uint8Array(await doc.rpc("save"));
    if (!token.isCancellationRequested) await atomicSave(target.fsPath, bytes);
  }
  async revertCustomDocument(doc: Book) {
    const bytes = await vscode.workspace.fs.readFile(doc.uri);
    await doc.rpc("reload", { bytes: Array.from(bytes) });
    doc.bytes = bytes;
    doc.diskHash = digest(bytes);
  }
  async backupCustomDocument(
    doc: Book,
    ctx: vscode.CustomDocumentBackupContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.CustomDocumentBackup> {
    const bytes = new Uint8Array(await doc.rpc("save"));
    if (token.isCancellationRequested)
      throw new Error("バックアップを中止しました");
    await vscode.workspace.fs.writeFile(ctx.destination, bytes);
    return {
      id: ctx.destination.toString(),
      delete: () => {
        void vscode.workspace.fs.delete(ctx.destination);
      },
    };
  }
}
export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      "canvasXlsx.editor",
      new Provider(context),
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      },
    ),
  );
}
