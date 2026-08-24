package com.lumora.core.conversation.application.support;

import com.lumora.core.conversation.domain.model.ChatStreamEvent;
import com.lumora.core.conversation.domain.model.ChatStreamEventType;
import com.lumora.core.conversation.domain.model.TokenUsage;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ConversationStreamAccumulatorTest {

    @Test
    void resetsProvisionalAnswerBeforePersistingFinalText() {
        ConversationStreamAccumulator accumulator =
                new ConversationStreamAccumulator();
        accumulator.accept(new ChatStreamEvent(
                ChatStreamEventType.TEXT_DELTA,
                "继续检索。",
                "model",
                null,
                ""
        ));
        accumulator.accept(new ChatStreamEvent(
                ChatStreamEventType.TEXT_RESET,
                "",
                "model",
                null,
                ""
        ));
        accumulator.accept(new ChatStreamEvent(
                ChatStreamEventType.TEXT_DELTA,
                "最终答案。",
                "model",
                null,
                ""
        ));

        assertThat(accumulator.getContent()).isEqualTo("最终答案。");
    }

    @Test
    void dropsOnlyTheResetDraftFromProtocolReplay() {
        ConversationStreamAccumulator accumulator =
                new ConversationStreamAccumulator();
        accumulator.accept(protocolEvent(Map.of(
                "role", "tool",
                "content", "BUILD SUCCESS",
                "toolCallId", "call-1"
        )));
        accumulator.accept(protocolEvent(Map.of(
                "role", "assistant",
                "content", "重定向前的草稿",
                "toolCalls", List.of()
        )));

        accumulator.accept(new ChatStreamEvent(
                ChatStreamEventType.TEXT_RESET,
                "",
                "model",
                null,
                ""
        ));

        assertThat(accumulator.getProtocolMessages()).containsExactly(
                Map.of(
                        "role", "tool",
                        "content", "BUILD SUCCESS",
                        "toolCallId", "call-1"
                )
        );
    }

    @Test
    void replacesLiveApprovalReviewWithItsPersistedResult() {
        ConversationStreamAccumulator accumulator =
                new ConversationStreamAccumulator();
        accumulator.accept(reviewEvent(
                ChatStreamEventType.APPROVAL_REVIEW_STARTED,
                "",
                Map.of("approvalReviewDecision", "reviewing")
        ));
        accumulator.accept(reviewEvent(
                ChatStreamEventType.APPROVAL_REVIEW_COMPLETED,
                "Approved for this call.",
                Map.of("approvalReviewDecision", "allow_once")
        ));

        assertThat(accumulator.getWorkLogEvents()).hasSize(1);
        ChatStreamEvent persisted = accumulator.getWorkLogEvents().get(0);
        assertThat(persisted.getType())
                .isEqualTo(ChatStreamEventType.APPROVAL_REVIEW_COMPLETED);
        assertThat(persisted.getOutput()).isEqualTo("Approved for this call.");
        assertThat(persisted.getMetadata())
                .containsEntry("approvalReviewDecision", "allow_once");
    }

    @Test
    void persistsChildAgentLifecycleAndNestedExecutionEvents() {
        ConversationStreamAccumulator accumulator =
                new ConversationStreamAccumulator();
        accumulator.accept(agentEvent(
                ChatStreamEventType.AGENT_STARTED,
                "agent-1",
                "",
                Map.of("agentStatus", "running")
        ));
        accumulator.accept(agentEvent(
                ChatStreamEventType.AGENT_EVENT,
                "agent-1:tool-1",
                "正在读取架构文档",
                Map.of(
                        "agentStatus", "running",
                        "childEventType", "tool_started"
                )
        ));
        accumulator.accept(agentEvent(
                ChatStreamEventType.AGENT_COMPLETED,
                "agent-1",
                "已完成架构检查",
                Map.of("agentStatus", "completed")
        ));

        assertThat(accumulator.getWorkLogEvents()).hasSize(2);
        assertThat(accumulator.getWorkLogEvents().get(0).getType())
                .isEqualTo(ChatStreamEventType.AGENT_COMPLETED);
        assertThat(accumulator.getWorkLogEvents().get(0).getOutput())
                .isEqualTo("已完成架构检查");
        assertThat(accumulator.getWorkLogEvents().get(1).getMetadata())
                .containsEntry("childEventType", "tool_started");
    }

    @Test
    void persistsAndMergesAgentTeamMessageDeliveryStates() {
        ConversationStreamAccumulator accumulator =
                new ConversationStreamAccumulator();
        accumulator.accept(peerMessageEvent(
                ChatStreamEventType.AGENT_PEER_MESSAGE_QUEUED,
                "queued"
        ));
        accumulator.accept(peerMessageEvent(
                ChatStreamEventType.AGENT_PEER_MESSAGE_DELIVERED,
                "delivered"
        ));
        accumulator.accept(peerMessageEvent(
                ChatStreamEventType.AGENT_PEER_MESSAGE_CONSUMED,
                "consumed"
        ));

        assertThat(accumulator.getWorkLogEvents()).singleElement()
                .satisfies(event -> {
                    assertThat(event.getType()).isEqualTo(
                            ChatStreamEventType.AGENT_PEER_MESSAGE_CONSUMED
                    );
                    assertThat(event.getDelta()).isEqualTo("复核接口契约");
                    assertThat(event.getMetadata())
                            .containsEntry("messageStatus", "consumed")
                            .containsEntry("targetAgentId", "agent-2");
                });
    }

    @Test
    void keepsTheLatestCumulativeUsageSnapshot() {
        ConversationStreamAccumulator accumulator =
                new ConversationStreamAccumulator();

        accumulator.accept(usageEvent(new TokenUsage(10, 2, 12)));
        accumulator.accept(usageEvent(new TokenUsage(30, 5, 35)));

        assertThat(accumulator.hasBillableUsage()).isTrue();
        assertThat(accumulator.getUsage().getTotalTokens()).isEqualTo(35);
    }

    @Test
    void capturesUsageAttachedToAFailedEventBeforeThrowing() {
        ConversationStreamAccumulator accumulator =
                new ConversationStreamAccumulator();
        ChatStreamEvent failed = new ChatStreamEvent(
                ChatStreamEventType.FAILED,
                "",
                "model",
                new TokenUsage(18, 3, 21),
                "provider failed"
        );

        assertThrows(IllegalStateException.class, () -> accumulator.accept(failed));

        assertThat(accumulator.hasBillableUsage()).isTrue();
        assertThat(accumulator.getUsage().getTotalTokens()).isEqualTo(21);
    }

    @Test
    void treatsInterruptedWorkLogAsAPersistableVisibleResult() {
        ConversationStreamAccumulator accumulator =
                new ConversationStreamAccumulator();
        accumulator.accept(new ChatStreamEvent(
                ChatStreamEventType.PROGRESS_MESSAGE,
                "正在分析项目结构",
                "model",
                null,
                "",
                "progress-1",
                "",
                "",
                "正在分析项目结构",
                Map.of(),
                "",
                0L,
                null,
                Map.of()
        ));

        assertThat(accumulator.hasVisibleOutput()).isTrue();
        assertThat(accumulator.hasBillableUsage()).isFalse();
        assertThat(accumulator.hasPersistableResult()).isTrue();
    }

    @Test
    void recordsPausedAsASealedNonCompletedTurn() {
        ConversationStreamAccumulator accumulator =
                new ConversationStreamAccumulator();

        accumulator.accept(new ChatStreamEvent(
                ChatStreamEventType.PAUSED,
                "",
                "model",
                null,
                ""
        ));

        assertThat(accumulator.isPaused()).isTrue();
        assertThat(accumulator.isCompleted()).isFalse();
    }

    @Test
    void capturesFullProtocolMessagesOutsideTheProjectedWorkLog() {
        ConversationStreamAccumulator accumulator =
                new ConversationStreamAccumulator();
        accumulator.accept(new ChatStreamEvent(
                ChatStreamEventType.PROTOCOL_MESSAGE,
                "",
                "model",
                null,
                "",
                "",
                "",
                "",
                "",
                Map.of(),
                "",
                0L,
                null,
                Map.of("message", Map.of(
                        "role", "tool",
                        "content", "完整工具输出",
                        "toolCallId", "call-1"
                ))
        ));

        assertThat(accumulator.getProtocolMessages()).containsExactly(
                Map.of(
                        "role", "tool",
                        "content", "完整工具输出",
                        "toolCallId", "call-1"
                )
        );
        assertThat(accumulator.getWorkLogEvents()).isEmpty();
    }

    private ChatStreamEvent usageEvent(TokenUsage usage) {
        return new ChatStreamEvent(
                ChatStreamEventType.USAGE,
                "",
                "model",
                usage,
                ""
        );
    }

    private ChatStreamEvent reviewEvent(
            ChatStreamEventType type,
            String output,
            Map<String, Object> metadata
    ) {
        return new ChatStreamEvent(
                type,
                "",
                "model",
                null,
                "",
                "approval-review-item-1",
                "call-1",
                "shell_command",
                "git push origin main",
                Map.of("command", "git push origin main"),
                output,
                20L,
                null,
                metadata
        );
    }

    private ChatStreamEvent protocolEvent(Map<String, Object> message) {
        return new ChatStreamEvent(
                ChatStreamEventType.PROTOCOL_MESSAGE,
                "", "model", null, "", "", "", "", "",
                Map.of(), "", 0L, null, Map.of("message", message)
        );
    }

    private ChatStreamEvent agentEvent(
            ChatStreamEventType type,
            String itemId,
            String output,
            Map<String, Object> extraMetadata
    ) {
        Map<String, Object> metadata = new java.util.LinkedHashMap<>(Map.of(
                "agentId", "agent-1",
                "sessionId", "run-1:agent:agent-1",
                "parentAgentId", "supervisor",
                "agentLabel", "架构检查"
        ));
        metadata.putAll(extraMetadata);
        return new ChatStreamEvent(
                type,
                "", "model", null, "", itemId, "", "", "架构检查",
                Map.of(), output, 20L, null, metadata
        );
    }

    private ChatStreamEvent peerMessageEvent(
            ChatStreamEventType type,
            String status
    ) {
        return new ChatStreamEvent(
                type,
                "复核接口契约",
                "model",
                null,
                "",
                "message-1",
                "",
                "",
                "研究 → 实现",
                Map.of(),
                "",
                0L,
                null,
                Map.of(
                        "teamId", "task-1",
                        "messageId", "message-1",
                        "senderAgentId", "agent-1",
                        "targetAgentId", "agent-2",
                        "messageStatus", status,
                        "messageKind", "peer",
                        "deliveryMode", "quiet"
                )
        );
    }
}
