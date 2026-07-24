package com.lumora.core.service;

import com.lumora.core.entity.AgentTask;
import com.lumora.core.entity.ApprovalDecision;
import com.lumora.core.entity.ApprovalRecord;
import com.lumora.core.entity.TaskStatus;
import com.lumora.core.mapper.ApprovalMapper;
import com.lumora.core.mapper.TaskMapper;
import com.lumora.core.service.impl.ApprovalServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ApprovalServiceTest {

    private static final String TASK_ID = "task-1";
    private static final String APPROVAL_ID = "approval-1";
    private static final Instant NOW = Instant.parse("2026-07-24T00:00:00Z");

    private final AtomicReference<AgentTask> task = new AtomicReference<>();
    private final AtomicReference<ApprovalRecord> approval =
            new AtomicReference<>();
    private TaskMapper taskMapper;
    private ApprovalMapper approvalMapper;
    private ApprovalService service;

    @BeforeEach
    void setUp() {
        task.set(task(TaskStatus.WAITING_APPROVAL));
        approval.set(approval());
        taskMapper = mock(TaskMapper.class);
        approvalMapper = mock(ApprovalMapper.class);
        when(taskMapper.selectById(anyString())).thenAnswer(invocation -> {
            AgentTask current = task.get();
            return current != null
                    && current.getTaskId().equals(invocation.getArgument(0))
                    ? current
                    : null;
        });
        when(approvalMapper.findPendingByTaskId(anyString()))
                .thenAnswer(invocation -> {
                    ApprovalRecord current = approval.get();
                    if (
                        current != null
                            && current.getTaskId().equals(
                                    invocation.getArgument(0)
                            )
                            && current.getDecision() == null
                    ) {
                        return java.util.Optional.of(current);
                    }
                    return java.util.Optional.empty();
                });
        doAnswer(invocation -> {
            task.set(invocation.getArgument(0));
            return 1;
        }).when(taskMapper).updateById(any(AgentTask.class));
        doAnswer(invocation -> {
            approval.set(invocation.getArgument(0));
            return 1;
        }).when(approvalMapper).updateDecision(any(ApprovalRecord.class));
        service = new ApprovalServiceImpl(
                taskMapper,
                approvalMapper,
                Clock.fixed(NOW, ZoneOffset.UTC)
        );
    }

    @Test
    void allowsTheExactPendingApprovalOnce() {
        AgentTask task = service.decideApproval(
                TASK_ID,
                APPROVAL_ID,
                ApprovalDecision.ALLOW_ONCE
        );

        assertThat(task.getStatus()).isEqualTo(TaskStatus.COMPLETED);
        assertThat(approval.get().getDecision())
                .isEqualTo(ApprovalDecision.ALLOW_ONCE);
        assertThat(approval.get().getDecidedAt()).isEqualTo(NOW);
    }

    @Test
    void rejectsAForgedApprovalId() {
        assertThatThrownBy(
                () -> service.decideApproval(
                        TASK_ID,
                        "forged",
                        ApprovalDecision.ALLOW_ONCE
                )
        ).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("不匹配");
    }

    @Test
    void rejectsApprovalBeforeTheTaskIsWaiting() {
        task.set(task(TaskStatus.RUNNING));

        assertThatThrownBy(
                () -> service.decideApproval(
                        TASK_ID,
                        APPROVAL_ID,
                        ApprovalDecision.ALLOW_ONCE
                )
        ).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("没有待处理");
    }

    @Test
    void rejectsARepeatedDecision() {
        service.decideApproval(
                TASK_ID,
                APPROVAL_ID,
                ApprovalDecision.REJECT
        );

        assertThatThrownBy(
                () -> service.decideApproval(
                        TASK_ID,
                        APPROVAL_ID,
                        ApprovalDecision.REJECT
                )
        ).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("没有待处理");
    }

    @Test
    void rejectsDecisionWhenApprovalWasAlreadyHandledConcurrently() {
        when(approvalMapper.updateDecision(any(ApprovalRecord.class)))
                .thenReturn(0);

        assertThatThrownBy(
                () -> service.decideApproval(
                        TASK_ID,
                        APPROVAL_ID,
                        ApprovalDecision.ALLOW_ONCE
                )
        )
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("审批已被处理");
        verify(taskMapper, never()).updateById(any(AgentTask.class));
    }

    private static AgentTask task(TaskStatus status) {
        return new AgentTask(
                TASK_ID,
                "整理下载目录",
                status,
                0L,
                "",
                "",
                "",
                NOW,
                NOW
        );
    }

    private static ApprovalRecord approval() {
        return new ApprovalRecord(
                APPROVAL_ID,
                TASK_ID,
                "MOVE_FILES",
                "移动下载目录中的文件",
                "MEDIUM",
                true,
                null,
                NOW,
                null
        );
    }

}
