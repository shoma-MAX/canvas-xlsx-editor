import { createHash, randomUUID } from "node:crypto";
import {
  readFile,
  writeFile,
  rename,
  unlink,
  open,
  stat,
} from "node:fs/promises";
import { dirname, join } from "node:path";
export const digest = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
export async function atomicSave(
  path: string,
  bytes: Uint8Array,
  expected?: string,
): Promise<string> {
  const current = await readFile(path).catch((e: NodeJS.ErrnoException) => {
    if (e.code === "ENOENT" && expected === undefined) return undefined;
    throw e;
  });
  if (expected !== undefined && (!current || digest(current) !== expected))
    throw new Error(
      "ファイルが外部で変更されました。別名で保存するか再読み込みしてください。",
    );
  const temp = join(dirname(path), `.canvas-xlsx-${randomUUID()}.tmp`);
  try {
    const mode = await stat(path)
      .then((s) => s.mode & 0o777)
      .catch(() => 0o600);
    await writeFile(temp, bytes, { flag: "wx", mode });
    const fd = await open(temp, "r+");
    try {
      await fd.sync();
    } finally {
      await fd.close();
    }
    // Recheck after staging to catch an external writer during serialization.
    if (expected !== undefined && digest(await readFile(path)) !== expected)
      throw new Error("保存中にファイルが外部で変更されました。");
    await rename(temp, path);
  } catch (e) {
    await unlink(temp).catch(() => {});
    throw e;
  }
  return digest(bytes);
}
