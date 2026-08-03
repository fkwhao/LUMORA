package com.lumora.core.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lumora.core.entity.MemoryItem;
import com.lumora.core.entity.MemoryScopeType;
import com.lumora.core.entity.MemoryStatus;
import com.lumora.core.entity.MemoryType;
import com.lumora.core.mapper.MemoryItemMapper;
import com.lumora.core.model.MemoryWriteRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MemoryServiceImplTest {

    private static final Instant NOW = Instant.parse("2026-08-03T02:00:00Z");

    private MemoryItemMapper mapper;
    private MemoryServiceImpl service;

    @BeforeEach
    void setUp() {
        mapper = mock(MemoryItemMapper.class);
        service = new MemoryServiceImpl(
                mapper,
                Clock.fixed(NOW, ZoneOffset.UTC),
                new ObjectMapper()
        );
    }

    @Test
    void storesStructuredMemoryAndNormalizesLocalUserScope() {
        when(mapper.selectOne(any())).thenReturn(null);

        MemoryItem result = service.remember(new MemoryWriteRequest(
                MemoryScopeType.USER,
                null,
                MemoryType.PREFERENCE,
                "用户偏好简洁回答",
                "user.response.style",
                "用户",
                "response_style",
                "简洁",
                null,
                "{\"style\":\"concise\"}",
                0.95,
                null,
                null
        ));

        ArgumentCaptor<MemoryItem> captor = ArgumentCaptor.forClass(
                MemoryItem.class
        );
        verify(mapper).insert(captor.capture());
        MemoryItem stored = captor.getValue();
        assertThat(result).isSameAs(stored);
        assertThat(stored.getScopeId()).isEqualTo("local-user");
        assertThat(stored.getContentHash()).hasSize(64);
        assertThat(stored.getStatus()).isEqualTo(MemoryStatus.ACTIVE);
    }

    @Test
    void rejectsInvalidStructuredData() {
        assertThatThrownBy(() -> service.remember(new MemoryWriteRequest(
                MemoryScopeType.USER,
                null,
                MemoryType.FACT,
                "测试记忆",
                "test.fact",
                "测试",
                "fact",
                "测试值",
                null,
                "not-json",
                1.0,
                null,
                null
        )))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("有效 JSON");
    }

    @Test
    void mergesParaphrasesAndVersionsChangedSlotValues() {
        MemoryItem existing = memory(
                "memory-database",
                MemoryScopeType.USER,
                "local-user",
                MemoryType.DECISION,
                "LUMORA 向量数据库使用 Milvus",
                null,
                0.95
        );
        existing.setDedupeKey("lumora.cloud.vector_database");
        existing.setSubject("LUMORA 云端");
        existing.setPredicate("vector_database");
        existing.setValue("Milvus");
        when(mapper.selectOne(any())).thenReturn(existing);

        MemoryItem same = service.remember(memoryRequest(
                "语义检索最终选用 Milvus",
                "Milvus"
        ));

        assertThat(same.getMemoryId()).isEqualTo("memory-database");
        assertThat(same.getVersion()).isEqualTo(1);
        assertThat(same.getContent()).isEqualTo("语义检索最终选用 Milvus");
        verify(mapper, never()).insert(any(MemoryItem.class));

        MemoryItem changed = service.remember(memoryRequest(
                "向量数据库最终调整为另一个实现",
                "OtherVectorStore"
        ));

        assertThat(changed.getMemoryId()).isEqualTo("memory-database");
        assertThat(changed.getVersion()).isEqualTo(2);
        assertThat(changed.getValue()).isEqualTo("OtherVectorStore");
    }

    @Test
    void upgradesLegacyMemorySelectedByExtractionTarget() {
        MemoryItem legacy = memory(
                "legacy-memory",
                MemoryScopeType.USER,
                "local-user",
                MemoryType.DECISION,
                "云端向量数据库使用 Milvus",
                null,
                0.9
        );
        legacy.setDedupeKey("");
        legacy.setSubject("");
        legacy.setPredicate("");
        legacy.setValue("");
        when(mapper.selectOne(any())).thenReturn(null);
        when(mapper.selectById("legacy-memory")).thenReturn(legacy);

        MemoryItem merged = service.remember(memoryRequest(
                "语义检索最终选用 Milvus",
                "Milvus",
                "legacy-memory"
        ));

        assertThat(merged.getMemoryId()).isEqualTo("legacy-memory");
        assertThat(merged.getDedupeKey())
                .isEqualTo("lumora.cloud.vector_database");
        verify(mapper, never()).insert(any(MemoryItem.class));
    }

    @Test
    void recallsOnlyActiveAndUnexpiredMemoriesForPrompt() {
        MemoryItem preference = memory(
                "memory-1",
                MemoryScopeType.USER,
                "local-user",
                MemoryType.PREFERENCE,
                "用户偏好简洁回答",
                null,
                0.9
        );
        MemoryItem expired = memory(
                "memory-2",
                MemoryScopeType.USER,
                "local-user",
                MemoryType.FACT,
                "已经失效的事实",
                NOW.minusSeconds(1),
                1.0
        );
        MemoryItem decision = memory(
                "memory-3",
                MemoryScopeType.CONVERSATION,
                "conversation-1",
                MemoryType.DECISION,
                "云端采用 MySQL 与 Milvus",
                null,
                0.95
        );
        when(mapper.selectList(any()))
                .thenReturn(List.of(preference, expired))
                .thenReturn(List.of(decision));

        String summary = service.buildPromptSummary("conversation-1");

        assertThat(summary)
                .contains("[偏好][key=test.memory-1] 用户偏好简洁回答")
                .contains("[决定][key=test.memory-3] 云端采用 MySQL 与 Milvus")
                .doesNotContain("已经失效的事实");
    }

    private static MemoryItem memory(
            String id,
            MemoryScopeType scopeType,
            String scopeId,
            MemoryType type,
            String content,
            Instant expiresAt,
            double confidence
    ) {
        return new MemoryItem(
                id,
                scopeType,
                scopeId,
                type,
                content,
                "{}",
                confidence,
                null,
                id + "-hash",
                "test." + id,
                "测试主体",
                "test_property",
                content,
                1,
                MemoryStatus.ACTIVE,
                expiresAt,
                NOW,
                NOW
        );
    }

    private static MemoryWriteRequest memoryRequest(
            String content,
            String value
    ) {
        return memoryRequest(content, value, null);
    }

    private static MemoryWriteRequest memoryRequest(
            String content,
            String value,
            String targetMemoryId
    ) {
        return new MemoryWriteRequest(
                MemoryScopeType.USER,
                null,
                MemoryType.DECISION,
                content,
                "lumora.cloud.vector_database",
                "LUMORA 云端",
                "vector_database",
                value,
                targetMemoryId,
                "{}",
                0.99,
                "message-new",
                null
        );
    }
}
