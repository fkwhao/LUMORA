package com.lumora.core.conversation.application.service.impl;

import com.lumora.core.conversation.domain.model.ArtifactChunk;

import com.lumora.core.conversation.domain.entity.Artifact;
import com.lumora.core.conversation.infrastructure.persistence.ArtifactMapper;
import com.lumora.core.conversation.domain.model.ArtifactChunk;
import com.lumora.core.conversation.domain.model.ChatStreamEvent;
import com.lumora.core.conversation.application.service.ArtifactService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.util.Map;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class ArtifactServiceImpl implements ArtifactService {
    private static final int MAX_READ_CHARS = 40_000;
    private static final Pattern ARTIFACT_ID_PATTERN = Pattern.compile(
            "^art_[0-9a-f]{32}$"
    );
    private static final Pattern SCOPE_ID_PATTERN = Pattern.compile(
            "^[A-Za-z0-9_-]{1,160}$"
    );
    private final ArtifactMapper mapper;
    private final Clock clock;

    @Override
    public void register(String taskId, String conversationId,
            ChatStreamEvent event) {
        Map<String, Object> metadata = event.getMetadata();
        String artifactId = text(metadata.get("artifactId"));
        if (artifactId == null || !ARTIFACT_ID_PATTERN.matcher(artifactId).matches()
                || mapper.selectById(artifactId) != null) {
            return;
        }
        String scopeId = required(metadata.get("artifactScopeId"),
                "Artifact 存储范围");
        if (!SCOPE_ID_PATTERN.matcher(scopeId).matches()) {
            throw new IllegalArgumentException("Artifact 存储范围无效");
        }
        mapper.insert(new Artifact(
                artifactId,
                taskId,
                conversationId,
                scopeId,
                value(text(metadata.get("sourceToolCallId"))),
                value(text(metadata.get("artifactMimeType")), "text/plain"),
                number(metadata.get("artifactByteSize")),
                number(metadata.get("artifactCharacterCount")),
                (int) number(metadata.get("artifactEstimatedTokens")),
                value(text(metadata.get("artifactSha256"))),
                "READY",
                clock.instant()
        ));
    }

    @Override
    public ArtifactChunk read(String taskId, String artifactId,
            long offset, int limit) {
        String normalizedArtifactId = required(artifactId, "Artifact ID");
        if (!ARTIFACT_ID_PATTERN.matcher(normalizedArtifactId).matches()) {
            throw new IllegalArgumentException("Artifact ID 无效");
        }
        Artifact artifact = mapper.selectById(normalizedArtifactId);
        if (artifact == null || !artifact.getTaskId().equals(taskId)) {
            throw new IllegalArgumentException("Artifact 不存在或不属于当前任务");
        }
        long safeOffset = Math.max(0, offset);
        int safeLimit = Math.min(MAX_READ_CHARS, Math.max(1, limit));
        Path path = resolvePath(artifact);
        char[] buffer = new char[safeLimit];
        int read;
        try (Reader reader = Files.newBufferedReader(path, StandardCharsets.UTF_8)) {
            long skipped = 0;
            while (skipped < safeOffset) {
                long current = reader.skip(safeOffset - skipped);
                if (current <= 0) break;
                skipped += current;
            }
            read = reader.read(buffer);
        } catch (IOException error) {
            throw new IllegalStateException("无法读取 Artifact", error);
        }
        String content = read <= 0 ? "" : new String(buffer, 0, read);
        long next = safeOffset + content.length();
        boolean hasMore = next < artifact.getCharacterCount();
        return new ArtifactChunk(
                artifactId, content, safeOffset, hasMore ? next : null,
                hasMore, artifact.getCharacterCount(), artifact.getMimeType(),
                artifact.getByteSize()
        );
    }

    private Path resolvePath(Artifact artifact) {
        String localAppData = System.getenv("LOCALAPPDATA");
        Path root = localAppData == null || localAppData.isBlank()
                ? Path.of(System.getProperty("java.io.tmpdir"), "lumora", "artifacts")
                : Path.of(localAppData, "LUMORA", "artifacts");
        Path parent = root.resolve(artifact.getStorageScopeId()).normalize();
        Path path = parent.resolve(artifact.getArtifactId() + ".txt").normalize();
        if (!path.getParent().equals(parent) || !Files.isRegularFile(path)) {
            throw new IllegalArgumentException("Artifact 文件不存在");
        }
        return path;
    }

    private static String required(Object value, String label) {
        String result = text(value);
        if (result == null) throw new IllegalArgumentException(label + "无效");
        return result;
    }

    private static String text(Object value) {
        if (!(value instanceof String string) || string.isBlank()) return null;
        return string.trim();
    }

    private static String value(String value) { return value(value, ""); }
    private static String value(String value, String fallback) {
        return value == null ? fallback : value;
    }
    private static long number(Object value) {
        return value instanceof Number number ? number.longValue() : 0L;
    }
}
