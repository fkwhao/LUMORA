// @vitest-environment node

import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadDevConfig } from "../../src/main/config/dev-config";

const temporaryDirectories: string[] = [];
const TOKEN = "a".repeat(64);

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("desktop local development config", () => {
  it("loads the Core loopback URL and startup token", () => {
    const configPath = writeConfig(`
lumora:
  core-url: http://127.0.0.1:45102
  startup-token: ${TOKEN}
`);

    expect(loadDevConfig(configPath)).toEqual({
      coreUrl: "http://127.0.0.1:45102",
      cloudApiUrl: "http://127.0.0.1:46100",
      cloudConsoleUrl: "http://127.0.0.1:5175/console",
      startupToken: TOKEN,
    });
    expect(Object.isFrozen(loadDevConfig(configPath))).toBe(true);
  });

  it("loads explicit secure Cloud endpoints and removes trailing slashes", () => {
    const configPath = writeConfig(`
lumora:
  core-url: http://127.0.0.1:45102
  cloud-api-url: https://api.lumora.example/
  cloud-console-url: https://lumora.example/console/
  startup-token: ${TOKEN}
`);

    expect(loadDevConfig(configPath)).toMatchObject({
      cloudApiUrl: "https://api.lumora.example",
      cloudConsoleUrl: "https://lumora.example/console",
    });
  });

  it("rejects insecure remote Cloud endpoints", () => {
    const configPath = writeConfig(`
lumora:
  core-url: http://127.0.0.1:45102
  cloud-api-url: http://10.0.0.8:46100
  startup-token: ${TOKEN}
`);

    expect(() => loadDevConfig(configPath)).toThrow("cloud-api-url");
  });

  it("rejects a missing config file with its path", () => {
    const configPath = path.join(tmpdir(), "lumora-missing-dev-local.yml");

    expect(() => loadDevConfig(configPath)).toThrow(configPath);
  });

  it("rejects malformed YAML", () => {
    const configPath = writeConfig("lumora: [");

    expect(() => loadDevConfig(configPath)).toThrow("YAML");
  });

  it("rejects a short token without exposing it", () => {
    const configPath = writeConfig(`
lumora:
  core-url: http://127.0.0.1:45102
  startup-token: secret
`);

    expect(() => loadDevConfig(configPath)).toThrow("startup-token");
    try {
      loadDevConfig(configPath);
    } catch (error) {
      expect(String(error)).not.toContain("secret");
    }
  });

  it("rejects non-loopback and incomplete URLs", () => {
    for (const coreUrl of [
      "http://192.168.1.8:45102",
      "https://127.0.0.1:45102",
      "http://127.0.0.1",
      "http://127.0.0.1:45102/path",
    ]) {
      const configPath = writeConfig(`
lumora:
  core-url: ${coreUrl}
  startup-token: ${TOKEN}
`);

      expect(() => loadDevConfig(configPath)).toThrow("core-url");
    }
  });

  it("rejects missing required keys", () => {
    for (const content of [
      "lumora:\n  core-url: http://127.0.0.1:45102\n",
      `lumora:\n  startup-token: ${TOKEN}\n`,
      "server: {}\n",
    ]) {
      const configPath = writeConfig(content);

      expect(() => loadDevConfig(configPath)).toThrow();
    }
  });
});

function writeConfig(content: string): string {
  const directory = mkdtempSync(path.join(tmpdir(), "lumora-config-"));
  temporaryDirectories.push(directory);
  const configPath = path.join(directory, "dev-local.yml");
  writeFileSync(configPath, content, "utf8");
  return configPath;
}
