package com.lumora.core.memory.application.support;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lumora.core.memory.domain.model.MemoryCandidate;
import com.lumora.core.shared.config.CoreProperties;
import com.lumora.core.memory.domain.entity.MemoryItem;
import com.lumora.core.memory.domain.model.MemoryScopeType;
import com.lumora.core.memory.domain.model.MemoryType;
import com.lumora.core.memory.domain.model.MemoryWriteRequest;
import com.lumora.core.memory.application.service.MemoryService;
import com.lumora.core.memory.application.port.MemoryExtractionPort;
import com.lumora.core.memory.application.support.MemoryExtractionCoordinator;
import com.lumora.core.memory.application.support.ProjectInstructionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MemoryExtractionCoordinatorTest {

    private static final Instant NOW = Instant.parse("2026-08-03T03:00:00Z");

    private MemoryExtractionPort memoryExtractionPort;
    private MemoryService memoryService;
    private MemoryExtractionCoordinator coordinator;
    private ProjectInstructionService projectInstructionService;

    @BeforeEach
    void setUp() {
        memoryExtractionPort = mock(MemoryExtractionPort.class);
        memoryService = mock(MemoryService.class);
        projectInstructionService = mock(ProjectInstructionService.class);
        when(memoryService.isEnabled()).thenReturn(true);
        when(memoryService.remember(any())).thenReturn(mock(MemoryItem.class));
        CoreProperties properties = new CoreProperties();
        properties.setMemoryAutoExtractionEnabled(true);
        coordinator = new MemoryExtractionCoordinator(
                memoryExtractionPort,
                memoryService,
                new ObjectMapper(),
                Clock.fixed(NOW, ZoneOffset.UTC),
                properties,
                projectInstructionService
        );
    }

    @Test
    void storesLongTermUserMemoryWithoutExpiry() {
        when(memoryExtractionPort.extractMemories(
                anyString(), anyString(), nullable(String.class),
                nullable(String.class), anyString()
        )).thenReturn(List.of(new MemoryCandidate(
                "USER",
                "PREFERENCE",
                "LONG_TERM",
                "用户偏好简洁回答",
                "user.response.style",
                "用户",
                "response_style",
                "简洁",
                null,
                Map.of("style", "concise"),
                0.95,
                null
        )));

        int count = coordinator.extractAndStore(
                "conversation-1",
                "message-1",
                "以后回答简洁一点",
                "好的",
                null,
                "correlation-1"
        );

        ArgumentCaptor<MemoryWriteRequest> captor = ArgumentCaptor.forClass(
                MemoryWriteRequest.class
        );
        verify(memoryService).remember(captor.capture());
        assertThat(count).isEqualTo(1);
        assertThat(captor.getValue().getScopeType())
                .isEqualTo(MemoryScopeType.USER);
        assertThat(captor.getValue().getMemoryType())
                .isEqualTo(MemoryType.PREFERENCE);
        assertThat(captor.getValue().getExpiresAt()).isNull();
    }

    @Test
    void storesShortTermConversationMemoryWithBoundedExpiry() {
        when(memoryExtractionPort.extractMemories(
                anyString(), anyString(), nullable(String.class),
                nullable(String.class), anyString()
        )).thenReturn(List.of(new MemoryCandidate(
                "CONVERSATION",
                "SUMMARY",
                "SHORT_TERM",
                "下一轮继续完善记忆提取",
                "conversation.next_goal",
                "当前会话",
                "next_goal",
                "完善记忆提取",
                null,
                Map.of(),
                0.8,
                3_600L
        )));

        coordinator.extractAndStore(
                "conversation-1",
                "message-1",
                "继续实现",
                "已完成基础部分",
                null,
                "correlation-1"
        );

        ArgumentCaptor<MemoryWriteRequest> captor = ArgumentCaptor.forClass(
                MemoryWriteRequest.class
        );
        verify(memoryService).remember(captor.capture());
        assertThat(captor.getValue().getScopeType())
                .isEqualTo(MemoryScopeType.CONVERSATION);
        assertThat(captor.getValue().getScopeId())
                .isEqualTo("conversation-1");
        assertThat(captor.getValue().getExpiresAt())
                .isEqualTo(NOW.plusSeconds(3_600));
    }

    @Test
    void storesProjectMemoryInNormalizedWorkspaceScope() {
        when(memoryExtractionPort.extractMemories(
                anyString(), anyString(), nullable(String.class),
                nullable(String.class), anyString()
        )).thenReturn(List.of(new MemoryCandidate(
                "PROJECT",
                "DECISION",
                "LONG_TERM",
                "项目使用 SQLite 持久化业务状态",
                "project.persistence.database",
                "项目",
                "persistence_database",
                "SQLite",
                null,
                Map.of(),
                0.95,
                0.85,
                null
        )));

        coordinator.extractAndStore(
                "conversation-1",
                "f:/project/lumora",
                "message-1",
                "保持 SQLite",
                "已确认",
                null,
                "correlation-1"
        );

        ArgumentCaptor<MemoryWriteRequest> captor = ArgumentCaptor.forClass(
                MemoryWriteRequest.class
        );
        verify(memoryService).remember(captor.capture());
        assertThat(captor.getValue().getScopeType())
                .isEqualTo(MemoryScopeType.PROJECT);
        assertThat(captor.getValue().getScopeId())
                .isEqualTo("f:/project/lumora");
        assertThat(captor.getValue().getImportance()).isEqualTo(0.85);
        assertThat(captor.getValue().getSourceType())
                .isEqualTo("CONVERSATION_EXTRACTION");
    }

    @Test
    void onlyLetsOneCandidateReuseTheSameLegacyMemoryId() {
        when(memoryExtractionPort.extractMemories(
                anyString(), anyString(), nullable(String.class),
                nullable(String.class), anyString()
        )).thenReturn(List.of(
                candidate(
                        "lumora.cloud.relational_database",
                        "relational_database",
                        "MySQL",
                        "legacy-combined"
                ),
                candidate(
                        "lumora.cloud.vector_database",
                        "vector_database",
                        "Milvus",
                        "legacy-combined"
                )
        ));

        coordinator.extractAndStore(
                "conversation-1",
                "message-1",
                "数据库方案保持不变",
                "已确认",
                null,
                "correlation-1"
        );

        ArgumentCaptor<MemoryWriteRequest> captor = ArgumentCaptor.forClass(
                MemoryWriteRequest.class
        );
        verify(memoryService, org.mockito.Mockito.times(2))
                .remember(captor.capture());
        assertThat(captor.getAllValues().get(0).getTargetMemoryId())
                .isEqualTo("legacy-combined");
        assertThat(captor.getAllValues().get(1).getTargetMemoryId()).isNull();
    }

    @Test
    void archivesAnExplicitlyRevokedMemory() {
        when(memoryExtractionPort.extractMemories(
                anyString(), anyString(), nullable(String.class),
                nullable(String.class), anyString()
        )).thenReturn(List.of(new MemoryCandidate(
                "PROJECT",
                "CONSTRAINT",
                "LONG_TERM",
                "项目只使用 Java",
                "project.language.constraint",
                "当前项目",
                "programming_language",
                "Java",
                "memory-java",
                Map.of(),
                0.98,
                0.8,
                null,
                "ARCHIVE",
                "MEMORY"
        )));

        int count = coordinator.extractAndStore(
                "conversation-1",
                "f:/project/lumora",
                "message-1",
                "取消只能使用 Java 的要求",
                "已取消",
                "id=memory-java; scope=PROJECT; type=DECISION; "
                        + "key=project.language.constraint; content=项目只使用 Java",
                "correlation-1"
        );

        assertThat(count).isEqualTo(1);
        verify(memoryService).archive(
                "memory-java",
                MemoryScopeType.PROJECT,
                "f:/project/lumora"
        );
    }

    @Test
    void writesAProjectRuleToTheManagedInstructionFile() {
        when(memoryExtractionPort.extractMemories(
                anyString(), anyString(), nullable(String.class),
                nullable(String.class), anyString()
        )).thenReturn(List.of(new MemoryCandidate(
                "PROJECT",
                "CONSTRAINT",
                "LONG_TERM",
                "当前项目统一使用 Java，不引入其他语言",
                "project.language.constraint",
                "当前项目",
                "programming_language",
                "Java",
                null,
                Map.of(),
                0.98,
                0.9,
                null,
                "UPSERT",
                "PROJECT_INSTRUCTIONS"
        )));
        when(projectInstructionService.apply(
                anyString(), anyString(), anyString(), anyString()
        )).thenReturn(true);

        int count = coordinator.extractAndStore(
                "conversation-1",
                "f:/project/lumora",
                "message-1",
                "这个项目统一使用 Java",
                "已记录",
                null,
                "correlation-1"
        );

        assertThat(count).isEqualTo(1);
        verify(projectInstructionService).apply(
                "f:/project/lumora",
                "UPSERT",
                "project.language.constraint",
                "当前项目统一使用 Java，不引入其他语言"
        );
        verify(memoryService, org.mockito.Mockito.never()).remember(any());
    }

    @Test
    void doesNotReactivateATargetArchivedEarlierInTheSameExtraction() {
        MemoryCandidate archived = new MemoryCandidate(
                "PROJECT", "DECISION", "LONG_TERM",
                "项目不再限制编程语言", "project.language.constraint",
                "当前项目", "programming_language", "不限制",
                "memory-java", Map.of(), 0.98, 0.8, null,
                "ARCHIVE", "MEMORY"
        );
        MemoryCandidate conflictingUpdate = new MemoryCandidate(
                "PROJECT", "DECISION", "LONG_TERM",
                "项目可以引入其他语言", "project.language.constraint",
                "当前项目", "programming_language", "不限制",
                "memory-java", Map.of(), 0.95, 0.8, null,
                "UPSERT", "MEMORY"
        );
        when(memoryExtractionPort.extractMemories(
                anyString(), anyString(), nullable(String.class),
                nullable(String.class), anyString()
        )).thenReturn(List.of(archived, conflictingUpdate));

        int count = coordinator.extractAndStore(
                "conversation-1", "f:/project/lumora", "message-1",
                "取消只能使用 Java 的要求", "已取消",
                "id=memory-java; scope=PROJECT; type=DECISION; "
                        + "key=project.language.constraint; content=项目只使用 Java",
                "correlation-1"
        );

        assertThat(count).isEqualTo(1);
        verify(memoryService).archive(
                "memory-java", MemoryScopeType.PROJECT, "f:/project/lumora"
        );
        verify(memoryService, org.mockito.Mockito.never()).remember(any());
    }

    private static MemoryCandidate candidate(
            String dedupeKey,
            String predicate,
            String value,
            String targetMemoryId
    ) {
        return new MemoryCandidate(
                "USER",
                "DECISION",
                "LONG_TERM",
                value,
                dedupeKey,
                "LUMORA 云端",
                predicate,
                value,
                targetMemoryId,
                Map.of(),
                0.99,
                null
        );
    }
}
