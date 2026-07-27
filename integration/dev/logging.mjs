import { mkdirSync } from "node:fs";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";

export function redactSecrets(text, secrets = []) {
  return secrets
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)
    .reduce((redacted, secret) => redacted.split(secret).join("[REDACTED]"), String(text));
}

export function createProcessLogger(options) {
  const { name, logDirectory, secrets = [], console: output = console } = options;
  mkdirSync(logDirectory, { recursive: true });
  const file = createWriteStream(path.join(logDirectory, `${name}.log`), { encoding: "utf8" });
  const decoders = { stdout: new StringDecoder("utf8"), stderr: new StringDecoder("utf8") };
  const pending = { stdout: "", stderr: "" };
  let closePromise;
  let closing = false;

  function write(stream, chunk) {
    if (closing) throw new Error("Process logger is closed or closing and cannot accept writes");
    if (!(stream in pending)) throw new Error(`Unknown process stream: ${stream}`);
    append(stream, decoders[stream].write(chunk));
  }

  function append(stream, text) {
    pending[stream] += text;
    const lines = pending[stream].split(/\r?\n/);
    pending[stream] = lines.pop();
    for (const line of lines) writeLine(stream, line);
  }

  function writeLine(stream, line) {
    // 日志生命周期：控制台和 UTF-8 文件仅接收逐行脱敏后的内容。
    const message = `[${name}] ${redactSecrets(line, secrets)}`;
    file.write(`${message}\n`, "utf8");
    (stream === "stderr" ? output.error : output.log)(message);
  }

  function close() {
    if (closePromise) return closePromise;
    closing = true;
    let resolveClose;
    let rejectClose;
    closePromise = new Promise((resolve, reject) => {
      resolveClose = resolve;
      rejectClose = reject;
    });
    for (const stream of Object.keys(pending)) {
      append(stream, decoders[stream].end());
      if (pending[stream]) {
        writeLine(stream, pending[stream]);
        pending[stream] = "";
      }
    }
    file.once("error", rejectClose);
    file.end(resolveClose);
    return closePromise;
  }

  return { write, close };
}
