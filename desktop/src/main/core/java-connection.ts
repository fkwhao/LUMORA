export interface JavaConnection {
  baseUrl: string;
  sessionToken: string;
}

export function validateJavaConnection(
  connection: JavaConnection,
): JavaConnection {
  const url = new URL(connection.baseUrl);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1") {
    throw new Error("Java Core 必须使用 127.0.0.1 HTTP 地址");
  }
  if (!connection.sessionToken) {
    throw new Error("Java Core 启动令牌不能为空");
  }
  return {
    baseUrl: url.origin,
    sessionToken: connection.sessionToken,
  };
}
