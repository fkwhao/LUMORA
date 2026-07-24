package com.lumora.core.mapper;

import com.lumora.core.entity.AgentTask;
import com.lumora.core.entity.ApprovalDecision;
import com.lumora.core.entity.ApprovalRecord;
import com.lumora.core.entity.TaskStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 使用真实 SQLite 验证 MyBatis-Plus 生成 SQL 和字段类型映射。
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.NONE,
        properties = {
                "spring.datasource.url="
                        + "jdbc:sqlite:target/mybatis-plus-mapper-test.db"
        }
)
class MyBatisPlusMapperTest {

    private static final Instant CREATED_AT =
            Instant.parse("2026-07-24T01:02:03Z");
    private static final Instant UPDATED_AT =
            Instant.parse("2026-07-24T02:03:04Z");

    @Autowired
    private TaskMapper taskMapper;

    @Autowired
    private ApprovalMapper approvalMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void resetSchema() {
        jdbcTemplate.execute("DROP TABLE IF EXISTS approval_request");
        jdbcTemplate.execute("DROP TABLE IF EXISTS agent_task");
        jdbcTemplate.execute("""
                CREATE TABLE agent_task (
                    task_id TEXT PRIMARY KEY,
                    goal TEXT NOT NULL,
                    status TEXT NOT NULL,
                    last_event_sequence INTEGER NOT NULL,
                    active_step TEXT NOT NULL,
                    result_summary TEXT NOT NULL,
                    failure_reason TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """);
        jdbcTemplate.execute("""
                CREATE TABLE approval_request (
                    approval_id TEXT PRIMARY KEY,
                    task_id TEXT NOT NULL,
                    action TEXT NOT NULL,
                    impact_summary TEXT NOT NULL,
                    risk_level TEXT NOT NULL,
                    reversible INTEGER NOT NULL,
                    decision TEXT,
                    created_at TEXT NOT NULL,
                    decided_at TEXT
                )
                """);
    }

    @Test
    void roundTripsTaskThroughBaseMapper() {
        AgentTask task = task("task-1");

        assertThat(taskMapper.insert(task)).isEqualTo(1);

        AgentTask stored = taskMapper.selectById(task.getTaskId());
        assertThat(stored.getTaskId()).isEqualTo("task-1");
        assertThat(stored.getStatus()).isEqualTo(TaskStatus.RUNNING);
        assertThat(stored.getCreatedAt()).isEqualTo(CREATED_AT);
        assertThat(stored.getLastEventSequence()).isEqualTo(7L);

        stored.setStatus(TaskStatus.COMPLETED);
        stored.setResultSummary("已完成");
        stored.setUpdatedAt(UPDATED_AT);
        assertThat(taskMapper.updateById(stored)).isEqualTo(1);

        AgentTask updated = taskMapper.selectById(task.getTaskId());
        assertThat(updated.getStatus()).isEqualTo(TaskStatus.COMPLETED);
        assertThat(updated.getResultSummary()).isEqualTo("已完成");
        assertThat(updated.getUpdatedAt()).isEqualTo(UPDATED_AT);
    }

    @Test
    void roundTripsApprovalAndOnlyAcceptsFirstDecision() {
        taskMapper.insert(task("task-2"));
        ApprovalRecord approval = new ApprovalRecord(
                "approval-1",
                "task-2",
                "MOVE_FILES",
                "移动下载目录中的文件",
                "MEDIUM",
                true,
                null,
                CREATED_AT,
                null
        );

        assertThat(approvalMapper.insert(approval)).isEqualTo(1);

        ApprovalRecord stored = approvalMapper.selectById("approval-1");
        assertThat(stored.isReversible()).isTrue();
        assertThat(stored.getDecision()).isNull();
        assertThat(stored.getCreatedAt()).isEqualTo(CREATED_AT);
        assertThat(approvalMapper.findPendingByTaskId("task-2"))
                .hasValueSatisfying(pending ->
                        assertThat(pending.getApprovalId())
                                .isEqualTo(stored.getApprovalId())
                );

        stored.setDecision(ApprovalDecision.ALLOW_ONCE);
        stored.setDecidedAt(UPDATED_AT);
        assertThat(approvalMapper.updateDecision(stored)).isEqualTo(1);

        ApprovalRecord competingDecision = new ApprovalRecord();
        competingDecision.setApprovalId("approval-1");
        competingDecision.setDecision(ApprovalDecision.REJECT);
        competingDecision.setDecidedAt(UPDATED_AT.plusSeconds(1));
        assertThat(approvalMapper.updateDecision(competingDecision))
                .isZero();

        ApprovalRecord decided = approvalMapper.selectById("approval-1");
        assertThat(decided.getDecision())
                .isEqualTo(ApprovalDecision.ALLOW_ONCE);
        assertThat(decided.getDecidedAt()).isEqualTo(UPDATED_AT);
        assertThat(approvalMapper.findPendingByTaskId("task-2")).isEmpty();
    }

    @Test
    void readsLegacyEpochMillisTimestamps() {
        jdbcTemplate.update(
                """
                INSERT INTO agent_task (
                    task_id,
                    goal,
                    status,
                    last_event_sequence,
                    active_step,
                    result_summary,
                    failure_reason,
                    created_at,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                "legacy-task",
                "读取旧数据库",
                TaskStatus.CREATED.name(),
                0L,
                "",
                "",
                "",
                Long.toString(CREATED_AT.toEpochMilli()),
                Long.toString(UPDATED_AT.toEpochMilli())
        );

        AgentTask stored = taskMapper.selectById("legacy-task");

        assertThat(stored.getCreatedAt()).isEqualTo(CREATED_AT);
        assertThat(stored.getUpdatedAt()).isEqualTo(UPDATED_AT);
    }

    private static AgentTask task(String taskId) {
        return new AgentTask(
                taskId,
                "整理下载目录",
                TaskStatus.RUNNING,
                7L,
                "执行移动",
                "",
                "",
                CREATED_AT,
                CREATED_AT
        );
    }
}
