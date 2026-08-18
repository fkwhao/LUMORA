"use client";

import {
  type PropsWithChildren,
  useEffect,
  useState,
  type FC,
  isValidElement,
} from "react";
import {
  XIcon,
  PlusIcon,
  FileText,
  Loader2Icon,
  AlertCircleIcon,
  ImageIcon,
} from "lucide-react";
import {
  AttachmentPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  useAuiState,
  useAui,
} from "@assistant-ui/react";
import { useShallow } from "zustand/shallow";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { cn } from "@/lib/utils";
import { attachmentReference } from "@/features/tasks/attachments/lumora-attachment-adapter";
import { attachmentTypeLabel } from "@/features/tasks/attachments/attachment-type-label";

const useFileSrc = (file: File | undefined) => {
  const [src, setSrc] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!file) {
      setSrc(undefined);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setSrc(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  return src;
};

const useAttachmentSrc = () => {
  const { file, src, reference } = useAuiState(
    useShallow((s): {
      file?: File;
      src?: string;
      reference?: ReturnType<typeof attachmentReference>;
    } => {
      if (s.attachment.type !== "image") return {};
      const reference = attachmentReference(s.attachment);
      if (s.attachment.file) return { file: s.attachment.file, reference };
      const src = s.attachment.content?.filter((c) => c.type === "image")[0]
        ?.image;
      return { src, reference };
    }),
  );
  const [pathSrc, setPathSrc] = useState<string | undefined>();
  const fileSrc = useFileSrc(file);

  useEffect(() => {
    let active = true;
    setPathSrc(undefined);
    if (!reference || reference.kind !== "IMAGE") return;
    void window.lumora.attachments
      .readImagePreview(reference)
      .then((preview) => {
        if (active) setPathSrc(preview);
      })
      .catch(() => {
        if (active) setPathSrc(undefined);
      });
    return () => {
      active = false;
    };
  }, [reference]);

  // Prefer the validated main-process preview once it is available. Chromium
  // object URLs give pasted images an immediate preview, while the path-backed
  // source keeps the same tile working after assistant-ui drops `file` on send.
  return pathSrc ?? fileSrc ?? src;
};

type AttachmentPreviewProps = {
  src: string;
};

const AttachmentPreview: FC<AttachmentPreviewProps> = ({ src }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  return (
    <img
      src={src}
      alt="Attachment preview"
      className={cn(
        "block h-auto max-h-[80vh] w-auto max-w-full rounded-sm object-contain transition-opacity duration-300 motion-reduce:transition-none",
        isLoaded
          ? "aui-attachment-preview-image-loaded opacity-100"
          : "aui-attachment-preview-image-loading opacity-0",
      )}
      onLoad={() => setIsLoaded(true)}
    />
  );
};

const AttachmentPreviewDialog: FC<PropsWithChildren> = ({ children }) => {
  const src = useAttachmentSrc();

  if (!src) return children;

  return (
    <Dialog>
      <DialogTrigger
        nativeButton={false}
        className="aui-attachment-preview-trigger cursor-zoom-in"
        render={isValidElement(children) ? children : <button type="button" />}
      />
      <DialogContent className="aui-attachment-preview-dialog-content [&>button]:bg-foreground/60 [&>button]:hover:bg-foreground/80 [&_svg]:text-background p-2 sm:max-w-3xl [&>button]:rounded-full [&>button]:p-1 [&>button]:opacity-100 [&>button]:ring-0!">
        <DialogTitle className="aui-sr-only sr-only">
          Image Attachment Preview
        </DialogTitle>
        <div className="aui-attachment-preview bg-background relative mx-auto flex max-h-[80dvh] w-full items-center justify-center overflow-hidden rounded-sm">
          <AttachmentPreview src={src} />
        </div>
      </DialogContent>
    </Dialog>
  );
};

const AttachmentThumb: FC<{ isImage: boolean }> = ({ isImage }) => {
  const src = useAttachmentSrc();
  const [failedSrc, setFailedSrc] = useState<string>();

  useEffect(() => {
    if (failedSrc !== src) setFailedSrc(undefined);
  }, [failedSrc, src]);

  if (!isImage) {
    return (
      <span className="aui-attachment-file-icon flex size-9 shrink-0 items-center justify-center rounded-lg bg-background/85 text-muted-foreground ring-1 ring-black/5 dark:ring-white/10">
        <FileText className="size-[18px] stroke-[1.55]" />
      </span>
    );
  }

  return (
    <span className="aui-attachment-tile-image-wrap relative flex h-full w-full items-center justify-center overflow-hidden rounded-[inherit] bg-background/65">
      {src && failedSrc !== src ? (
        <img
          src={src}
          alt="Attachment preview"
          className="aui-attachment-tile-image h-full w-full rounded-[inherit] object-cover"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <span className="aui-attachment-tile-fallback flex h-full w-full items-center justify-center rounded-[inherit]">
          <ImageIcon className="aui-attachment-tile-fallback-icon text-muted-foreground/80 size-6 stroke-[1.5]" />
        </span>
      )}
    </span>
  );
};

const AttachmentUI: FC = () => {
  const aui = useAui();
  const isComposer = aui.attachment.source !== "message";

  const isImage = useAuiState((s) => s.attachment.type === "image");
  const typeLabel = useAuiState((s) =>
    attachmentTypeLabel({
      type: s.attachment.type,
      name: s.attachment.name,
      contentType: s.attachment.contentType,
    }),
  );

  const uploadState = useAuiState((s) =>
    s.attachment.status.type === "running"
      ? "uploading"
      : s.attachment.status.type === "incomplete" &&
          s.attachment.status.reason === "error"
        ? "error"
        : undefined,
  );
  const isUploading = uploadState === "uploading";
  const isError = uploadState === "error";

  const errorMessage = useAuiState((s) =>
    s.attachment.status.type === "incomplete" &&
    s.attachment.status.reason === "error"
      ? (s.attachment.status.message ?? "Upload failed")
      : undefined,
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <AttachmentPrimitive.Root
          className={cn(
            "aui-attachment-root relative",
            isComposer &&
              "animate-in fade-in-0 zoom-in-95 duration-200 motion-reduce:animate-none",
            isImage &&
              !isComposer &&
              "aui-attachment-root-message",
          )}
        >
          <AttachmentPreviewDialog>
            <TooltipTrigger
              render={
                <div
                  className={cn(
                    "aui-attachment-tile bg-muted hover:after:bg-foreground/10 focus-visible:ring-ring/50 relative cursor-pointer overflow-hidden rounded-[calc(var(--composer-radius)-var(--composer-padding))] transition-transform outline-none after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:ring-1 after:ring-black/10 after:transition-colors after:ring-inset focus-visible:ring-3 active:scale-[0.98] motion-reduce:transition-none dark:after:ring-white/10",
                    isImage
                      ? isComposer
                        ? "h-16 w-24"
                        : "h-24 w-36"
                      : "flex h-14 w-[min(220px,52vw)] items-center gap-2.5 px-2.5 pr-8",
                    isError &&
                      "after:ring-destructive/60 dark:after:ring-destructive/60",
                  )}
                  role="button"
                  tabIndex={0}
                  aria-label={`${typeLabel} attachment${
                    isError
                      ? ", upload failed"
                      : isUploading
                        ? ", uploading"
                        : ""
                  }`}
                />
              }
            >
              <AttachmentThumb isImage={isImage} />
              {!isImage && (
                <span className="min-w-0 text-left leading-tight">
                  <span className="block truncate text-[12.5px] font-medium">
                    <AttachmentPrimitive.Name />
                  </span>
                  <span className="text-muted-foreground mt-1 block text-[10.5px]">
                    {typeLabel}
                  </span>
                </span>
              )}
              {isUploading && (
                <div
                  aria-hidden="true"
                  className="aui-attachment-tile-uploading bg-background/60 animate-in fade-in-0 absolute inset-0 flex items-center justify-center backdrop-blur-[2px] motion-reduce:animate-none"
                >
                  <Loader2Icon className="text-muted-foreground size-4 animate-spin" />
                </div>
              )}
              {isError && (
                <div
                  aria-hidden="true"
                  className="aui-attachment-tile-error bg-background/70 animate-in fade-in-0 absolute inset-0 flex items-center justify-center backdrop-blur-[2px] motion-reduce:animate-none"
                >
                  <AlertCircleIcon className="text-destructive size-4" />
                </div>
              )}
            </TooltipTrigger>
          </AttachmentPreviewDialog>
          {isComposer && <AttachmentRemove />}
        </AttachmentPrimitive.Root>
        <TooltipContent side="top">
          <AttachmentPrimitive.Name />
          {errorMessage && (
            <p className="aui-attachment-error-message">{errorMessage}</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

const AttachmentRemove: FC = () => {
  return (
    <AttachmentPrimitive.Remove
      render={
        <TooltipIconButton
          tooltip="移除附件"
          className="aui-attachment-tile-remove absolute end-1 top-1 size-5 rounded-full bg-black/50! text-white backdrop-blur-sm after:absolute after:-inset-1.5 hover:bg-black/70! hover:text-white! active:scale-[0.96] motion-reduce:transition-none"
          side="top"
        />
      }
    >
      <XIcon className="aui-attachment-remove-icon size-3 stroke-[2.5]" />
    </AttachmentPrimitive.Remove>
  );
};

export const UserMessageAttachments: FC = () => {
  return (
    <div className="aui-user-message-attachments-end col-span-full col-start-1 row-start-1 flex w-full flex-row justify-end gap-2">
      <MessagePrimitive.Attachments>
        {() => <AttachmentUI />}
      </MessagePrimitive.Attachments>
    </div>
  );
};

export const ComposerAttachments: FC = () => {
  return (
    <div className="aui-composer-attachments flex w-full flex-row items-center gap-2 overflow-x-auto empty:hidden">
      <ComposerPrimitive.Attachments>
        {() => <AttachmentUI />}
      </ComposerPrimitive.Attachments>
    </div>
  );
};

export const ComposerAddAttachment: FC = () => {
  return (
    <ComposerPrimitive.AddAttachment
      render={
        <TooltipIconButton
          tooltip="添加附件"
          side="bottom"
          variant="ghost"
          size="icon"
          className="aui-composer-add-attachment hover:bg-muted-foreground/15 dark:border-muted-foreground/15 dark:hover:bg-muted-foreground/30 size-7 rounded-full p-1 text-xs font-semibold active:scale-[0.96] motion-reduce:transition-none"
          aria-label="添加附件"
        />
      }
    >
      <PlusIcon className="aui-attachment-add-icon size-4.5 stroke-[1.5px]" />
    </ComposerPrimitive.AddAttachment>
  );
};
