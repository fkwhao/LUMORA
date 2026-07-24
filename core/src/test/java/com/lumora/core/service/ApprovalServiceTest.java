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
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ApprovalServiceTest {

    private static final String TASK_ID = "task-1";
    private static final String APPROVAL_ID = "approval-1";
    private static final Instant NOW = Instant.parse("2026-07-24T00:00:00Z");

    private final MutableTaskMapper taskMapper = new MutableTaskMapper();
    private final MutableApprovalMapper approvalMapper =
            new MutableApprovalMapper();
    private final ApprovalService service = new ApprovalServiceImpl(
            taskMapper,
            approvalMapper,
            Clock.fixed(NOW, ZoneOffset.UTC)
    );

    @BeforeEach
    void setUp() {
        taskMapper.task = task(TaskStatus.WAITING_APPROVAL);
        approvalMapper.approval = approval();
    }

    @Test
    void allowsTheExactPendingApprovalOnce() {
        AgentTask task = service.decideApproval(
                TASK_ID,
                APPROVAL_ID,
                ApprovalDecision.ALLOW_ONCE
        );

        assertThat(task.getStatus()).isEqualTo(TaskStatus.COMPLETED);
        assertThat(approvalMapper.approval.getDecision())
                .isEqualTo(ApprovalDecision.ALLOW_ONCE);
        assertThat(approvalMapper.approval.getDecidedAt()).isEqualTo(NOW);
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
        taskMapper.task = task(TaskStatus.RUNNING);

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

    static class MutableTaskMapper implements TaskMapper {

        private AgentTask task;

        @Override
        public int insert(AgentTask newTask) {
            task = newTask;
            return 1;
        }

        @Override
        public Optional<AgentTask> findById(String taskId) {
            if (task != null && task.getTaskId().equals(taskId)) {
                return Optional.of(task);
            }
            return Optional.empty();
        }

        @Override
        public int update(AgentTask updatedTask) {
            task = updatedTask;
            return 1;
        }
    }

    static class MutableApprovalMapper implements ApprovalMapper {

        private ApprovalRecord approval;

        @Override
        public Optional<ApprovalRecord> findPendingByTaskId(String taskId) {
            if (
                approval != null
                    && approval.getTaskId().equals(taskId)
                    && approval.getDecision() == null
            ) {
                return Optional.of(approval);
            }
            return Optional.empty();
        }

        @Override
        public int updateDecision(ApprovalRecord updatedApproval) {
            approval = updatedApproval;
            return 1;
        }
    }
}
