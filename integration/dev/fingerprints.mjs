import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function hashFiles(paths) {
  const hash = createHash("sha256");

  for (const filePath of [...paths].sort()) {
    hash.update(path.normalize(filePath));
    hash.update("\0");
    hash.update(await readFile(filePath));
    hash.update("\0");
  }

  return hash.digest("hex");
}

export async function readStamp(stampPath) {
  try {
    return (await readFile(stampPath, "utf8")).trim();
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function writeStamp(stampPath, fingerprint) {
  await mkdir(path.dirname(stampPath), { recursive: true });
  await writeFile(stampPath, fingerprint, "utf8");
}

export async function needsRefresh({ fingerprint, stampPath, outputs }) {
  // 指纹匹配仍需所有生成物存在，避免中断后的半成品被复用。
  for (const output of outputs) {
    try {
      await access(output);
    } catch (error) {
      if (error.code === "ENOENT") {
        return true;
      }
      throw error;
    }
  }

  return (await readStamp(stampPath)) !== fingerprint;
}
