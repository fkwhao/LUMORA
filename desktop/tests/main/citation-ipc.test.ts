import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  BrowserWindow: {},
  ipcMain: {},
  WebContentsView: class {},
}));

import {
  readAttachmentCitation,
  readLocalCitation,
} from "../../src/main/features/citation/citation-ipc";
import type { ModelGateway } from "../../src/main/features/model/model-gateway";
import type { TaskGateway } from "../../src/main/features/task/task-gateway";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    fs.rm(directory, { recursive: true, force: true })
  ));
});

describe("citation local preview", () => {
  it("reads project text files but rejects traversal outside the project", async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), "lumora-citation-"));
    temporaryDirectories.push(parent);
    const workspace = path.join(parent, "workspace");
    const outside = path.join(parent, "outside.txt");
    const pdf = path.join(parent, "paper.pdf");
    await fs.mkdir(path.join(workspace, "src"), { recursive: true });
    await fs.writeFile(path.join(workspace, "src", "main.ts"), "export const ready = true;\n");
    await fs.writeFile(outside, "secret\n");
    await fs.writeFile(pdf, "%PDF-1.7\n%%EOF\n");

    const taskGateway = {
      get: vi.fn(async () => ({ workspacePath: workspace })),
    } as unknown as TaskGateway;
    const modelGateway = {
      getTaskWorktree: vi.fn(async () => undefined),
      listMessages: vi.fn(async () => [{
        role: "user",
        content: "Read the attachment",
        attachments: [{
          attachmentId: "attachment-paper",
          name: "paper.pdf",
          mimeType: "application/pdf",
          size: 15,
          path: pdf,
          kind: "FILE",
          source: "LOCAL_FILE",
        }],
      }]),
    } as unknown as ModelGateway;

    await expect(readLocalCitation(
      taskGateway,
      modelGateway,
      "task-citation",
      "src/main.ts",
    )).resolves.toMatchObject({
      kind: "text",
      displayPath: path.join("src", "main.ts"),
      content: "export const ready = true;\n",
    });

    await expect(readLocalCitation(
      taskGateway,
      modelGateway,
      "task-citation",
      "../outside.txt",
    )).rejects.toThrow("不在当前项目目录内");

    await expect(readAttachmentCitation(
      modelGateway,
      "task-citation",
      "attachment-paper",
    )).resolves.toMatchObject({
      kind: "pdf",
      name: "paper.pdf",
      mimeType: "application/pdf",
    });

    await expect(readAttachmentCitation(
      modelGateway,
      "task-citation",
      "attachment-missing",
    )).rejects.toThrow("引用附件不存在");
  });
});
