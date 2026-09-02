import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowUp,
  Check,
  ChevronDown,
  File as FileIcon,
  Folder,
  Hand,
  Image as ImageIcon,
  Plus,
  ShieldAlert,
  X,
} from "lucide-react";

import type { MessageAttachment } from "../../../../shared/attachment-contract";
import type {
  CloudModelCatalog,
  LumoraCloudApi,
} from "../../../../shared/cloud-contract";
import type {
  LumoraModelApi,
  ModelSettings,
  PermissionMode,
} from "../../../../shared/model-contract";
import { Button } from "../../../components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "../../../components/ui/popover";
import { resizeTextarea } from "../../../utils/auto-resize-textarea";
import { submitFormOnEnter } from "../../../utils/submit-on-enter";

const PERMISSION_MODE_STORAGE_KEY = "lumora.permission-mode";

const permissionModeOptions: Array<{
  value: PermissionMode;
  label: string;
  description: string;
}> = [
  {
    value: "request_approval",
    label: "请求批准",
    description: "编辑外部文件和使用互联网时始终询问",
  },
  {
    value: "auto_approve",
    label: "替我审批",
    description: "仅对检测到的风险操作请求批准",
  },
  {
    value: "full_access",
    label: "完全访问权限",
    description: "允许工作区内操作；外部路径与危险命令仍受保护",
  },
];

export interface HomeComposerSubmission {
  content: string;
  attachments: MessageAttachment[];
  model?: string;
  permissionMode: PermissionMode;
}

interface HomeComposerProps {
  isCreating: boolean;
  cloudApi?: LumoraCloudApi;
  modelApi?: LumoraModelApi;
  notify(message: string, tone?: "info" | "success"): void;
  onSubmit(submission: HomeComposerSubmission): Promise<void>;
}

function HomeAttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: MessageAttachment;
  onRemove(): void;
}) {
  const [preview, setPreview] = useState<string>();

  useEffect(() => {
    let active = true;
    if (attachment.kind !== "IMAGE") {
      setPreview(undefined);
      return;
    }
    void window.lumora.attachments.readImagePreview(attachment)
      .then((src) => {
        if (active) setPreview(src);
      })
      .catch(() => {
        if (active) setPreview(undefined);
      });
    return () => {
      active = false;
    };
  }, [attachment]);

  return (
    <span className="home-attachment-chip">
      <i aria-hidden="true" className={preview ? "has-preview" : undefined}>
        {preview
          ? <img alt="" src={preview} />
          : attachment.kind === "IMAGE"
            ? <ImageIcon size={16} />
            : <FileIcon size={16} />}
      </i>
      <span title={attachment.path}>{attachment.name}</span>
      <button
        type="button"
        aria-label={`移除附件 ${attachment.name}`}
        onClick={onRemove}
      >
        <X size={12} />
      </button>
    </span>
  );
}

export function HomeComposer({
  isCreating,
  cloudApi,
  modelApi,
  notify,
  onSubmit,
}: HomeComposerProps) {
  const [goal, setGoal] = useState("");
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [isDraggingAttachment, setIsDraggingAttachment] = useState(false);
  const [openMenu, setOpenMenu] = useState<"add" | "permission" | "model" | null>(null);
  const [modelSettings, setModelSettings] = useState<ModelSettings>();
  const [cloudModelCatalog, setCloudModelCatalog] = useState<CloudModelCatalog>();
  const [isSwitchingModel, setIsSwitchingModel] = useState(false);
  const [selectedModel, setSelectedModel] = useState("");
  const [permissionMode, setPermissionMode] = useState(loadPermissionMode);
  const fileInput = useRef<HTMLInputElement>(null);
  const goalInput = useRef<HTMLTextAreaElement>(null);

  useEffect(() => resizeTextarea(goalInput.current, 220), [goal]);

  useEffect(() => {
    if (!modelApi) return;
    let cancelled = false;
    void Promise.all([
      modelApi.getSettings(),
      cloudApi?.getModelCatalog().catch(() => undefined),
    ])
      .then(([settings, catalog]) => {
        if (cancelled) return;
        setModelSettings(settings);
        setCloudModelCatalog(catalog);
        setSelectedModel(selectedComposerModel(settings, catalog));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [cloudApi, modelApi]);

  const cloudManaged = cloudModelCatalog?.state.modelSource === "CLOUD_MANAGED";

  const modelOptions = useMemo(
    () => cloudManaged && (cloudModelCatalog?.models.length ?? 0) > 0
      ? cloudModelCatalog!.models.map((model) => model.code)
      : [
          ...new Set([
            modelSettings?.model ?? "",
            ...(modelSettings?.models.map((model) => model.modelId) ?? []),
          ].filter(Boolean)),
        ],
    [cloudManaged, cloudModelCatalog, modelSettings],
  );

  async function selectComposerModel(model: string) {
    if (!cloudManaged || !cloudApi || !modelApi) {
      setSelectedModel(model);
      setOpenMenu(null);
      return;
    }
    setIsSwitchingModel(true);
    try {
      const state = await cloudApi.selectCloudModel(model);
      const settings = await modelApi.getSettings();
      setCloudModelCatalog((current) => current ? { ...current, state } : current);
      setModelSettings(settings);
      setSelectedModel(model);
      setOpenMenu(null);
    } catch (error) {
      notify(error instanceof Error ? error.message : "切换官方模型失败");
    } finally {
      setIsSwitchingModel(false);
    }
  }

  async function submitGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = goal.trim()
      || (attachments.length > 0 ? "请查看这些附件。" : "");
    if (!content || isCreating) return;
    await onSubmit({
      content,
      attachments,
      model: selectedModel || undefined,
      permissionMode,
    });
  }

  function chooseLocalContext(folder: boolean) {
    const input = fileInput.current;
    if (!input) return;
    folder
      ? input.setAttribute("webkitdirectory", "")
      : input.removeAttribute("webkitdirectory");
    input.click();
  }

  async function addAttachmentFiles(files: File[]) {
    const available = Math.max(0, 10 - attachments.length);
    const selected = files.slice(0, available);
    if (selected.length === 0) {
      notify("一次最多添加 10 个附件");
      return;
    }
    try {
      const prepared = await Promise.all(
        selected.map((file) => window.lumora.attachments.prepare(file)),
      );
      setAttachments((current) => [...current, ...prepared]);
      notify(`已添加 ${prepared.length} 个附件`, "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "添加附件失败");
    }
  }

  function selectPermissionMode(mode: PermissionMode) {
    setPermissionMode(mode);
    savePermissionMode(mode);
    setOpenMenu(null);
  }

  return (
    <form
      className={`home-native-composer${isDraggingAttachment ? " is-dragging-attachment" : ""}`}
      onSubmit={(event) => void submitGoal(event).catch(() => undefined)}
      onDragEnter={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          setIsDraggingAttachment(true);
        }
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) event.preventDefault();
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsDraggingAttachment(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsDraggingAttachment(false);
        void addAttachmentFiles([...event.dataTransfer.files]);
      }}
    >
      <input
        ref={fileInput}
        className="visually-hidden"
        type="file"
        multiple
        onChange={(event) => {
          void addAttachmentFiles([...(event.target.files ?? [])]);
          event.target.value = "";
        }}
      />

      {attachments.length > 0 && (
        <div className="home-attachment-strip" aria-label="待发送附件">
          {attachments.map((attachment) => (
            <HomeAttachmentChip
              attachment={attachment}
              key={attachment.attachmentId}
              onRemove={() => setAttachments((current) =>
                current.filter((item) =>
                  item.attachmentId !== attachment.attachmentId
                ))}
            />
          ))}
        </div>
      )}

      <textarea
        ref={goalInput}
        id="task-goal"
        className="home-native-composer-input"
        autoFocus
        aria-label="告诉 LUMORA 你的目标"
        value={goal}
        onChange={(event) => setGoal(event.target.value)}
        onKeyDown={submitFormOnEnter}
        onPaste={(event) => {
          const files = [...event.clipboardData.files];
          if (files.length === 0) return;
          event.preventDefault();
          void addAttachmentFiles(files);
        }}
        placeholder="描述要完成的任务…"
        rows={4}
      />

      <footer className="home-native-composer-toolbar">
        <div className="home-native-composer-tools">
          <Popover
            open={openMenu === "add"}
            onOpenChange={(open) => setOpenMenu(open ? "add" : null)}
          >
            <PopoverTrigger
              type="button"
              className="home-native-composer-icon-button"
              aria-label="添加附件"
              title="添加附件"
            >
              <Plus size={14} />
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="start"
              sideOffset={8}
              className="home-composer-popover home-add-popover w-56 rounded-xl p-1.5"
            >
              <Button
                variant="ghost"
                type="button"
                onClick={() => {
                  setOpenMenu(null);
                  chooseLocalContext(false);
                }}
              >
                <FileIcon />
                <span>选择文件</span>
              </Button>
              <Button
                variant="ghost"
                type="button"
                onClick={() => {
                  setOpenMenu(null);
                  chooseLocalContext(true);
                }}
              >
                <Folder />
                <span>选择文件夹</span>
              </Button>
            </PopoverContent>
          </Popover>

          <Popover
            open={openMenu === "permission"}
            onOpenChange={(open) => setOpenMenu(open ? "permission" : null)}
          >
            <PopoverTrigger
              type="button"
              className={`home-native-composer-control${
                permissionMode === "full_access" ? " is-dangerous" : ""
              }`}
              aria-label="选择权限模式"
              title={permissionModeLabel(permissionMode)}
            >
              <PermissionModeIcon mode={permissionMode} size={14} />
              <span>{permissionModeLabel(permissionMode)}</span>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="start"
              sideOffset={8}
              className="home-composer-popover permission-popover w-[330px] gap-1 rounded-xl p-2"
            >
              <PopoverHeader className="px-2 py-1.5">
                <PopoverTitle>应如何批准 LUMORA 操作？</PopoverTitle>
              </PopoverHeader>
              {permissionModeOptions.map((option) => (
                <Button
                  className={[
                    "h-auto w-full justify-start gap-3 px-2.5 py-2 text-start",
                    option.value === permissionMode ? "is-selected" : "",
                    option.value === "full_access" ? "is-dangerous" : "",
                  ].filter(Boolean).join(" ")}
                  variant="ghost"
                  type="button"
                  role="menuitemradio"
                  aria-checked={option.value === permissionMode}
                  key={option.value}
                  onClick={() => selectPermissionMode(option.value)}
                >
                  <span className="permission-option-icon">
                    <PermissionModeIcon mode={option.value} size={18} />
                  </span>
                  <span className="permission-option-copy flex flex-1 flex-col items-start">
                    <strong>{option.label}</strong>
                    <small className="text-muted-foreground font-normal">
                      {option.description}
                    </small>
                  </span>
                  {option.value === permissionMode && (
                    <Check className="permission-option-check" />
                  )}
                </Button>
              ))}
            </PopoverContent>
          </Popover>

          <Popover
            open={openMenu === "model"}
            onOpenChange={(open) => setOpenMenu(open ? "model" : null)}
          >
            <PopoverTrigger
              type="button"
              className="home-native-composer-control home-native-model-trigger"
              aria-label="选择模型"
              title={selectedModel || "选择模型"}
              disabled={!modelApi}
            >
              <span>{selectedModel ? composerModelDisplayName(selectedModel, cloudModelCatalog) : "模型"}</span>
              <ChevronDown size={14} />
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="start"
              sideOffset={8}
              className="home-composer-popover home-model-popover w-64 rounded-xl p-1.5"
            >
              <PopoverHeader className="px-2 py-1.5">
                <PopoverTitle>选择模型</PopoverTitle>
              </PopoverHeader>
              <div role="menu" aria-label="首页模型">
                {modelOptions.map((model) => (
                  <Button
                    className="home-model-option"
                    variant="ghost"
                    type="button"
                    role="menuitemradio"
                    aria-checked={model === selectedModel}
                    disabled={isSwitchingModel}
                    key={model}
                    onClick={() => {
                      void selectComposerModel(model);
                    }}
                  >
                    <span>{composerModelDisplayName(model, cloudModelCatalog)}</span>
                    {model === selectedModel && <Check />}
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <button
          className="submit-task"
          type="submit"
          aria-label="开始任务"
          disabled={(!goal.trim() && attachments.length === 0) || isCreating}
        >
          <ArrowUp size={16} strokeWidth={2.1} />
        </button>
      </footer>
    </form>
  );
}

function loadPermissionMode(): PermissionMode {
  try {
    const value = window.localStorage.getItem(PERMISSION_MODE_STORAGE_KEY);
    if (
      value === "full_access" ||
      value === "auto_approve" ||
      value === "request_approval"
    ) {
      return value;
    }
  } catch {
    // Storage can be unavailable in hardened renderer environments.
  }
  return "request_approval";
}

function savePermissionMode(mode: PermissionMode): void {
  try {
    window.localStorage.setItem(PERMISSION_MODE_STORAGE_KEY, mode);
  } catch {
    // The current selection remains valid for this new conversation.
  }
}

function permissionModeLabel(mode: PermissionMode): string {
  return permissionModeOptions.find((option) => option.value === mode)?.label
    ?? "请求批准";
}

function PermissionModeIcon({
  mode,
  size,
}: {
  mode: PermissionMode;
  size: number;
}) {
  if (mode === "request_approval") {
    return <Hand aria-hidden="true" size={size} strokeWidth={1.65} />;
  }
  if (mode === "full_access") {
    return <ShieldAlert aria-hidden="true" size={size} strokeWidth={1.65} />;
  }
  return (
    <svg
      aria-hidden="true"
      className="permission-auto-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2.7 20 6v5.3c0 5.2-3.25 8.45-8 10-4.75-1.55-8-4.8-8-10V6l8-3.3Z" />
      <path d="m8.5 10.1 2 1.9-2 1.9" />
      <path d="M13 14h2.7" />
    </svg>
  );
}

function modelDisplayName(model: string): string {
  if (model === "gpt-5.6-sol") return "5.6 Sol";
  if (model === "gpt-5.6-terra") return "5.6 Terra";
  return model;
}

function composerModelDisplayName(
  model: string,
  catalog?: CloudModelCatalog,
): string {
  return catalog?.models.find((candidate) => candidate.code === model)?.displayName
    ?? modelDisplayName(model);
}

function selectedComposerModel(
  settings: ModelSettings,
  catalog?: CloudModelCatalog,
): string {
  if (catalog?.state.modelSource !== "CLOUD_MANAGED") return settings.model;
  const selected = catalog.models.find(
    (model) => model.code === catalog.state.selectedCloudModelCode,
  );
  return selected?.code ?? catalog.models[0]?.code ?? settings.model;
}
