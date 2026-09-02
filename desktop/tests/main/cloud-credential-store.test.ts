// @vitest-environment node

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  CloudCredentialStore,
  type CloudStringCrypto,
} from "../../src/main/features/cloud/cloud-credential-store";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Cloud credential store", () => {
  it("persists refresh tokens encrypted and keeps a stable device id", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "lumora-cloud-credentials-"));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, "cloud-session.json");
    const store = new CloudCredentialStore(filePath, reversibleCrypto());

    const deviceId = store.getDeviceId();
    store.saveRefreshToken("refresh-secret-value");

    expect(store.getDeviceId()).toBe(deviceId);
    expect(store.loadRefreshToken()).toBe("refresh-secret-value");
    expect(readFileSync(filePath, "utf8")).not.toContain("refresh-secret-value");

    store.clearRefreshToken();
    expect(store.loadRefreshToken()).toBeUndefined();
    expect(store.getDeviceId()).toBe(deviceId);
  });

  it("refuses to save plaintext when system encryption is unavailable", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "lumora-cloud-credentials-"));
    temporaryDirectories.push(directory);
    const store = new CloudCredentialStore(
      path.join(directory, "cloud-session.json"),
      { ...reversibleCrypto(), isEncryptionAvailable: () => false },
    );

    expect(() => store.saveRefreshToken("secret")).toThrow("安全存储");
  });
});

function reversibleCrypto(): CloudStringCrypto {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from([...value].reverse().join("")),
    decryptString: (value) => [...value.toString("utf8")].reverse().join(""),
  };
}
