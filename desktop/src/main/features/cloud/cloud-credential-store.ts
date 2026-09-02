import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

export interface CloudStringCrypto {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

interface StoredCredentialFile {
  version: 1;
  deviceId: string;
  encryptedRefreshToken?: string;
}

export class CloudCredentialStore {
  constructor(
    private readonly filePath: string,
    private readonly crypto: CloudStringCrypto,
  ) {}

  getDeviceId(): string {
    const current = this.read();
    if (current?.deviceId) return current.deviceId;
    const deviceId = randomUUID();
    this.write({ version: 1, deviceId });
    return deviceId;
  }

  loadRefreshToken(): string | undefined {
    const encoded = this.read()?.encryptedRefreshToken;
    if (!encoded) return undefined;
    if (!this.crypto.isEncryptionAvailable()) {
      throw new Error("当前系统安全存储不可用，无法恢复云端登录");
    }
    try {
      return this.crypto.decryptString(Buffer.from(encoded, "base64"));
    } catch {
      throw new Error("云端登录凭据已损坏，请重新登录");
    }
  }

  saveRefreshToken(refreshToken: string): void {
    if (!refreshToken) throw new Error("云端刷新凭据不能为空");
    if (!this.crypto.isEncryptionAvailable()) {
      throw new Error("当前系统安全存储不可用，不能安全保存云端登录");
    }
    const current = this.read();
    this.write({
      version: 1,
      deviceId: current?.deviceId ?? randomUUID(),
      encryptedRefreshToken: this.crypto
        .encryptString(refreshToken)
        .toString("base64"),
    });
  }

  clearRefreshToken(): void {
    const current = this.read();
    this.write({
      version: 1,
      deviceId: current?.deviceId ?? randomUUID(),
    });
  }

  private read(): StoredCredentialFile | undefined {
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as Partial<StoredCredentialFile>;
      if (
        parsed.version !== 1
        || typeof parsed.deviceId !== "string"
        || parsed.deviceId.length < 8
      ) {
        return undefined;
      }
      return {
        version: 1,
        deviceId: parsed.deviceId,
        encryptedRefreshToken:
          typeof parsed.encryptedRefreshToken === "string"
            ? parsed.encryptedRefreshToken
            : undefined,
      };
    } catch {
      return undefined;
    }
  }

  private write(value: StoredCredentialFile): void {
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify(value), {
      encoding: "utf8",
      mode: 0o600,
    });
    renameSync(temporaryPath, this.filePath);
  }
}
