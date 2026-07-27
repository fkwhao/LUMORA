import { createServer as defaultCreateServer } from "node:net";

export function allocateLoopbackPort(options = {}) {
  const createServer = options.createServer ?? defaultCreateServer;

  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.once("listening", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Loopback server did not provide a TCP port")));
        return;
      }

      // 安全边界：临时监听器只绑定 IPv4 loopback，端口不会暴露到局域网。
      server.close(() => resolve(address.port));
    });
    server.listen({ host: "127.0.0.1", port: 0 });
  });
}
