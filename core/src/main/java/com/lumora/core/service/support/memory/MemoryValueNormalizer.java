package com.lumora.core.service.support.memory;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lumora.core.entity.MemoryScopeType;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.text.Normalizer;
import java.util.HexFormat;
import java.util.Locale;
import java.util.regex.Pattern;

/** 统一完成记忆输入规范化、结构校验和稳定摘要计算。 */
@Component
@RequiredArgsConstructor
public class MemoryValueNormalizer {

    private static final String LOCAL_USER_SCOPE_ID = "local-user";
    private static final int MAX_STRUCTURED_DATA_LENGTH = 16_000;
    private static final Pattern DEDUPE_KEY_PATTERN = Pattern.compile(
            "^[a-z0-9][a-z0-9._-]{0,239}$"
    );

    private final ObjectMapper objectMapper;

    public String normalizeDedupeKey(String value) {
        String normalized = requireText(value, "记忆去重键")
                .toLowerCase(Locale.ROOT);
        if (!DEDUPE_KEY_PATTERN.matcher(normalized).matches()) {
            throw new IllegalArgumentException("记忆去重键格式无效");
        }
        return normalized;
    }

    public String canonicalValue(String value) {
        if (value == null) {
            return "";
        }
        return Normalizer.normalize(value, Normalizer.Form.NFKC)
                .trim()
                .toLowerCase(Locale.ROOT)
                .replaceAll("\\s+", " ");
    }

    public String normalizeScopeId(
            MemoryScopeType scopeType,
            String scopeId
    ) {
        if (scopeType == MemoryScopeType.USER
                && (scopeId == null || scopeId.isBlank())) {
            return LOCAL_USER_SCOPE_ID;
        }
        return requireText(scopeId, "记忆范围 ID");
    }

    public String normalizeStructuredData(String value) {
        String normalized = value == null || value.isBlank()
                ? "{}"
                : value.trim();
        if (normalized.length() > MAX_STRUCTURED_DATA_LENGTH) {
            throw new IllegalArgumentException("记忆结构化数据超过限制");
        }
        try {
            JsonNode parsed = objectMapper.readTree(normalized);
            if (!parsed.isObject()) {
                throw new IllegalArgumentException(
                        "记忆结构化数据必须是 JSON 对象"
                );
            }
        } catch (JsonProcessingException error) {
            throw new IllegalArgumentException(
                    "记忆结构化数据不是有效 JSON",
                    error
            );
        }
        return normalized;
    }

    public String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(
                    digest.digest(value.getBytes(StandardCharsets.UTF_8))
            );
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException("当前运行时不支持 SHA-256", error);
        }
    }

    public String requireText(String value, String label) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(label + "不能为空");
        }
        return value.trim();
    }

    public <T> T requireValue(T value, String label) {
        if (value == null) {
            throw new IllegalArgumentException(label + "不能为空");
        }
        return value;
    }

    public String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
