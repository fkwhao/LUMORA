package com.lumora.core.conversation.application.support;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.lumora.core.conversation.domain.entity.ConversationInput;
import com.lumora.core.conversation.domain.model.ConversationInputStatus;
import com.lumora.core.conversation.domain.model.ConversationInputTarget;
import com.lumora.core.conversation.infrastructure.persistence.ConversationInputMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Instant;
import java.util.List;

@Component
@RequiredArgsConstructor
public class ConversationInputStore {

    private final ConversationInputMapper mapper;
    private final Clock clock;

    public void insert(ConversationInput input) {
        mapper.insert(input);
    }

    public ConversationInput requireForTask(String taskId, String inputId) {
        ConversationInput input = mapper.selectById(inputId);
        if (input == null || !taskId.equals(input.getTaskId())) {
            throw new IllegalArgumentException("队列内容不存在");
        }
        return input;
    }

    public List<ConversationInput> listOpenForTask(String taskId) {
        return mapper.selectList(
                Wrappers.<ConversationInput>lambdaQuery()
                        .eq(ConversationInput::getTaskId, taskId)
                        .in(ConversationInput::getStatus,
                                ConversationInputStatus.PENDING,
                                ConversationInputStatus.DELIVERED)
                        .orderByAsc(ConversationInput::getPosition)
                        .orderByAsc(ConversationInput::getCreatedAt)
        );
    }

    public List<ConversationInput> listOpenForRun(String runId) {
        return mapper.selectList(
                Wrappers.<ConversationInput>lambdaQuery()
                        .eq(ConversationInput::getRunId, runId)
                        .eq(ConversationInput::getTarget,
                                ConversationInputTarget.NEXT_STEP)
                        .in(ConversationInput::getStatus,
                                ConversationInputStatus.PENDING,
                                ConversationInputStatus.DELIVERED)
                        .orderByAsc(ConversationInput::getPosition)
                        .orderByAsc(ConversationInput::getCreatedAt)
        );
    }

    public ConversationInput firstPendingNextTurn(String taskId) {
        return mapper.selectOne(
                Wrappers.<ConversationInput>lambdaQuery()
                        .eq(ConversationInput::getTaskId, taskId)
                        .eq(ConversationInput::getTarget,
                                ConversationInputTarget.NEXT_TURN)
                        .eq(ConversationInput::getStatus,
                                ConversationInputStatus.PENDING)
                        .orderByAsc(ConversationInput::getPosition)
                        .orderByAsc(ConversationInput::getCreatedAt)
                        .last("LIMIT 1")
        );
    }

    public List<String> listTaskIdsWithPendingNextTurns() {
        return mapper.selectList(
                Wrappers.<ConversationInput>lambdaQuery()
                        .eq(ConversationInput::getTarget,
                                ConversationInputTarget.NEXT_TURN)
                        .eq(ConversationInput::getStatus,
                                ConversationInputStatus.PENDING)
                        .select(ConversationInput::getTaskId)
        ).stream().map(ConversationInput::getTaskId).distinct().toList();
    }

    public long nextPosition(String taskId) {
        return listOpenForTask(taskId).stream()
                .mapToLong(ConversationInput::getPosition)
                .max().orElse(0L) + 1L;
    }

    public ConversationInput save(ConversationInput input) {
        input.setUpdatedAt(clock.instant());
        mapper.updateById(input);
        return requireForTask(input.getTaskId(), input.getInputId());
    }

    public ConversationInput saveIfOpen(ConversationInput input) {
        input.setUpdatedAt(clock.instant());
        mapper.update(input,
                Wrappers.<ConversationInput>lambdaUpdate()
                        .eq(ConversationInput::getInputId, input.getInputId())
                        .in(ConversationInput::getStatus,
                                ConversationInputStatus.PENDING,
                                ConversationInputStatus.DELIVERED));
        return requireForTask(input.getTaskId(), input.getInputId());
    }

    public ConversationInput markDeliveredIfPending(ConversationInput input) {
        Instant now = clock.instant();
        mapper.update(null,
                Wrappers.<ConversationInput>lambdaUpdate()
                        .eq(ConversationInput::getInputId, input.getInputId())
                        .eq(ConversationInput::getStatus,
                                ConversationInputStatus.PENDING)
                        .set(ConversationInput::getStatus,
                                ConversationInputStatus.DELIVERED)
                        .set(ConversationInput::getUpdatedAt, now));
        return requireForTask(input.getTaskId(), input.getInputId());
    }

    public ConversationInput markStatus(
            ConversationInput input,
            ConversationInputStatus status
    ) {
        input.setStatus(status);
        input.setClaimedAt(status == ConversationInputStatus.CLAIMED
                ? clock.instant() : null);
        return save(input);
    }

    public void resetDeliveredForRun(String runId) {
        Instant now = clock.instant();
        mapper.update(null,
                Wrappers.<ConversationInput>lambdaUpdate()
                        .eq(ConversationInput::getRunId, runId)
                        .eq(ConversationInput::getStatus,
                                ConversationInputStatus.DELIVERED)
                        .set(ConversationInput::getStatus,
                                ConversationInputStatus.PENDING)
                        .set(ConversationInput::getUpdatedAt, now));
    }

    public void moveOpenSteersToNextTurn(String runId) {
        Instant now = clock.instant();
        mapper.update(null,
                Wrappers.<ConversationInput>lambdaUpdate()
                        .eq(ConversationInput::getRunId, runId)
                        .eq(ConversationInput::getTarget,
                                ConversationInputTarget.NEXT_STEP)
                        .in(ConversationInput::getStatus,
                                ConversationInputStatus.PENDING,
                                ConversationInputStatus.DELIVERED)
                        .set(ConversationInput::getRunId, null)
                        .set(ConversationInput::getTarget,
                                ConversationInputTarget.NEXT_TURN)
                        .set(ConversationInput::getStatus,
                                ConversationInputStatus.PENDING)
                        .set(ConversationInput::getUpdatedAt, now));
    }

    public void cancelOpenForTask(String taskId) {
        Instant now = clock.instant();
        mapper.update(null,
                Wrappers.<ConversationInput>lambdaUpdate()
                        .eq(ConversationInput::getTaskId, taskId)
                        .in(ConversationInput::getStatus,
                                ConversationInputStatus.PENDING,
                                ConversationInputStatus.DELIVERED)
                        .set(ConversationInput::getStatus,
                                ConversationInputStatus.CANCELLED)
                        .set(ConversationInput::getUpdatedAt, now));
    }
}
