package com.lumora.core.conversation.domain.model;

import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.util.List;

/**
 * Metadata-only reference to a file owned by the operating system.
 * Attachment bytes are never persisted in the conversation database.
 */
public record MessageAttachment(
        String attachmentId,
        String name,
        String mimeType,
        long size,
        String path,
        Kind kind,
        Source source
) {
    public static final int MAX_ATTACHMENTS = 10;
    public static final long MAX_IMAGE_BYTES = 20L * 1024L * 1024L;
    public static final long MAX_FILE_BYTES = 25L * 1024L * 1024L;

    public enum Kind { IMAGE, FILE }
    public enum Source { LOCAL_FILE, CLIPBOARD_TEMP }

    public MessageAttachment {
        attachmentId = requireText(attachmentId, 100, "附件 ID");
        name = requireText(name, 260, "附件名称");
        mimeType = requireText(mimeType, 160, "附件类型");
        path = requireText(path, 4000, "附件路径");
        if (kind == null || source == null) {
            throw new IllegalArgumentException("附件类别不能为空");
        }
        if (!isAbsolutePath(path)) {
            throw new IllegalArgumentException("附件必须引用绝对路径");
        }
        long maximum = kind == Kind.IMAGE ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
        if (size < 0 || size > maximum) {
            throw new IllegalArgumentException(
                    kind == Kind.IMAGE
                            ? "图片不能超过 20 MB"
                            : "文件不能超过 25 MB"
            );
        }
    }

    public static List<MessageAttachment> normalize(
            List<MessageAttachment> attachments
    ) {
        if (attachments == null || attachments.isEmpty()) return List.of();
        if (attachments.size() > MAX_ATTACHMENTS) {
            throw new IllegalArgumentException("一次最多添加 10 个附件");
        }
        if (attachments.stream().anyMatch(item -> item == null)) {
            throw new IllegalArgumentException("附件引用无效");
        }
        return List.copyOf(attachments);
    }

    private static String requireText(String value, int maximum, String label) {
        if (value == null || value.isBlank() || value.length() > maximum
                || value.indexOf('\0') >= 0) {
            throw new IllegalArgumentException(label + "无效");
        }
        return value.trim();
    }

    private static boolean isAbsolutePath(String value) {
        try {
            return Path.of(value).isAbsolute()
                    || value.matches("^[A-Za-z]:[\\\\/].+");
        } catch (InvalidPathException error) {
            return false;
        }
    }
}
