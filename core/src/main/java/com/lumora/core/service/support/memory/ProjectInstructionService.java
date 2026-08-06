package com.lumora.core.service.support.memory;

import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class ProjectInstructionService {

    static final String START_MARKER =
            "<!-- LUMORA:MANAGED-PROJECT-INSTRUCTIONS:START -->";
    static final String END_MARKER =
            "<!-- LUMORA:MANAGED-PROJECT-INSTRUCTIONS:END -->";
    private static final String GENERATED_HEADING =
            "# LUMORA Project Instructions";
    private static final int MAX_FILE_CHARACTERS = 64_000;
    private static final int MAX_INSTRUCTION_CHARACTERS = 4_000;
    private static final Pattern KEY_PATTERN = Pattern.compile(
            "[a-z0-9][a-z0-9._-]{0,239}"
    );
    private static final Pattern ENTRY_PATTERN = Pattern.compile(
            "(?m)^- \\[([a-z0-9][a-z0-9._-]{0,239})] (.+)$"
    );

    public synchronized boolean apply(
            String workspacePath,
            String action,
            String dedupeKey,
            String content
    ) {
        String key = requireKey(dedupeKey);
        String normalizedAction = requireAction(action);
        Path instructionFile = resolveInstructionFile(workspacePath);
        String existing = readExisting(instructionFile);
        ManagedSection section = parse(existing);
        boolean changed;
        if ("ARCHIVE".equals(normalizedAction)) {
            changed = section.entries().remove(key) != null;
            if (!changed) {
                return false;
            }
        } else {
            String instruction = requireContent(content);
            changed = !instruction.equals(section.entries().put(
                    key, instruction
            ));
            if (!changed) {
                return false;
            }
        }
        write(instructionFile, render(section));
        return true;
    }

    private Path resolveInstructionFile(String workspacePath) {
        if (workspacePath == null || workspacePath.isBlank()) {
            throw new IllegalArgumentException("项目指令缺少工作区路径");
        }
        try {
            Path workspace = Path.of(workspacePath.trim())
                    .toAbsolutePath()
                    .normalize()
                    .toRealPath();
            if (!Files.isDirectory(workspace)) {
                throw new IllegalArgumentException("工作区路径不是目录");
            }
            Path directory = workspace.resolve(".lumora").normalize();
            if (!directory.startsWith(workspace)) {
                throw new IllegalArgumentException("项目指令路径越出工作区");
            }
            Files.createDirectories(directory);
            Path realDirectory = directory.toRealPath();
            if (!realDirectory.startsWith(workspace)) {
                throw new IllegalArgumentException("项目指令目录越出工作区");
            }
            return realDirectory.resolve("AGENTS.md");
        } catch (IOException error) {
            throw new IllegalStateException("无法准备项目指令目录", error);
        }
    }

    private String readExisting(Path file) {
        if (!Files.exists(file)) {
            return "";
        }
        try {
            String content = Files.readString(file, StandardCharsets.UTF_8);
            if (content.length() > MAX_FILE_CHARACTERS) {
                throw new IllegalArgumentException("项目指令文件超过大小限制");
            }
            return content;
        } catch (IOException error) {
            throw new IllegalStateException("无法读取项目指令文件", error);
        }
    }

    private ManagedSection parse(String existing) {
        int start = existing.indexOf(START_MARKER);
        int end = existing.indexOf(END_MARKER);
        if (start < 0 && end < 0) {
            return new ManagedSection(existing.stripTrailing(),
                    new LinkedHashMap<>(), "");
        }
        if (start < 0 || end < start) {
            throw new IllegalStateException("项目指令受控区块标记不完整");
        }
        int bodyStart = start + START_MARKER.length();
        Map<String, String> entries = new LinkedHashMap<>();
        Matcher matcher = ENTRY_PATTERN.matcher(
                existing.substring(bodyStart, end)
        );
        while (matcher.find()) {
            entries.put(matcher.group(1), matcher.group(2).trim());
        }
        return new ManagedSection(
                existing.substring(0, start).stripTrailing(),
                entries,
                existing.substring(end + END_MARKER.length()).stripLeading()
        );
    }

    private String render(ManagedSection section) {
        StringBuilder managed = new StringBuilder(START_MARKER).append('\n');
        section.entries().forEach((key, value) -> managed
                .append("- [").append(key).append("] ")
                .append(value).append('\n'));
        managed.append(END_MARKER);
        String prefix = section.prefix().isBlank()
                ? GENERATED_HEADING
                : section.prefix();
        String suffix = section.suffix().isBlank()
                ? ""
                : "\n\n" + section.suffix();
        return prefix + "\n\n" + managed + suffix + "\n";
    }

    private void write(Path file, String content) {
        if (content.length() > MAX_FILE_CHARACTERS) {
            throw new IllegalArgumentException("项目指令文件超过大小限制");
        }
        Path temporary = file.resolveSibling("AGENTS.md.tmp");
        try {
            Files.writeString(temporary, content, StandardCharsets.UTF_8);
            try {
                Files.move(temporary, file,
                        StandardCopyOption.ATOMIC_MOVE,
                        StandardCopyOption.REPLACE_EXISTING);
            } catch (AtomicMoveNotSupportedException ignored) {
                Files.move(temporary, file,
                        StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException error) {
            throw new IllegalStateException("无法写入项目指令文件", error);
        }
    }

    private static String requireAction(String value) {
        if (!"UPSERT".equals(value) && !"ARCHIVE".equals(value)) {
            throw new IllegalArgumentException("未知项目指令操作");
        }
        return value;
    }

    private static String requireKey(String value) {
        String normalized = value == null ? "" : value.trim();
        if (!KEY_PATTERN.matcher(normalized).matches()) {
            throw new IllegalArgumentException("项目指令去重键无效");
        }
        return normalized;
    }

    private static String requireContent(String value) {
        String normalized = value == null
                ? ""
                : value.replace('\r', ' ')
                        .replace('\n', ' ')
                        .trim()
                        .replaceAll("\\s+", " ");
        if (normalized.isEmpty()
                || normalized.length() > MAX_INSTRUCTION_CHARACTERS) {
            throw new IllegalArgumentException("项目指令内容无效");
        }
        return normalized;
    }

    private record ManagedSection(
            String prefix,
            Map<String, String> entries,
            String suffix
    ) {
    }
}
