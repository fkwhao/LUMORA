import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

export class CoreProcessManager {
  private child?: ChildProcessWithoutNullStreams;

  start(command: string, args: string[], environment: NodeJS.ProcessEnv): void {
    if (this.child) {
      throw new Error("Java Local Core is already running.");
    }

    // Java 进程参数只来自打包配置，Renderer 无法传入命令或环境变量。
    this.child = spawn(command, args, {
      env: environment,
      windowsHide: true,
      stdio: "pipe",
    });
    this.child.once("exit", () => {
      this.child = undefined;
    });
  }

  stop(): void {
    this.child?.kill();
    this.child = undefined;
  }
}

