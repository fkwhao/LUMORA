package com.lumora.core.shared.config;

import com.zaxxer.hikari.HikariDataSource;
import liquibase.integration.spring.SpringLiquibase;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.file.Path;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import javax.sql.DataSource;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
class DatabaseMigrationTest {

    private static final Path DATABASE_PATH = Path.of(
            "target",
            "migration-" + UUID.randomUUID() + ".db"
    ).toAbsolutePath();

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private SpringLiquibase liquibase;

    @Autowired
    private DataSource dataSource;

    @Autowired
    private TransactionTemplate transactionTemplate;

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add(
                "spring.datasource.url",
                () -> "jdbc:sqlite:" + DATABASE_PATH
                        .toString()
                        .replace('\\', '/')
        );
    }

    @Test
    void appliesAllSchemaChangesOnlyOnceToTheSameDatabase() throws Exception {
        Integer businessTableCount = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                FROM sqlite_master
                WHERE type = 'table'
                  AND name IN (
                      'agent_task',
                      'approval_request',
                      'task_plan_step',
                      'conversation',
                      'conversation_message',
                      'model_configuration',
                      'model_configuration_model',
                      'memory_item',
                      'application_setting',
                      'conversation_context_summary',
                      'artifact'
                  )
                """,
                Integer.class
        );
        Integer foreignKeysEnabled = jdbcTemplate.queryForObject(
                "PRAGMA foreign_keys",
                Integer.class
        );

        assertThat(businessTableCount).isEqualTo(11);
        assertThat(agentControlPlaneTableCount()).isEqualTo(4);
        assertThat(agentControlPlaneChangeSetCount()).isEqualTo(1);
        assertThat(taskWorkspaceChangeSetCount()).isEqualTo(1);
        assertThat(foreignKeysEnabled).isEqualTo(1);
        assertThat(applicationChangeSetCount()).isEqualTo(23);
        assertThat(conversationMessageColumns()).contains(
                "parent_message_id", "message_depth", "active_path",
                "input_tokens", "output_tokens", "reasoning_tokens",
                "cache_read_tokens", "cache_write_tokens",
                "cache_metrics_available"
        );
        assertThat(taskPlanStepPrimaryKeyColumns())
                .containsExactly("plan_step_id");
        assertThat(modelConfigurationColumns())
                .contains("api_format", "is_active");
        assertThat(providerModelColumns())
                .contains("model_id", "context_window", "max_output_tokens",
                        "reasoning_efforts");
        assertThat(agentTaskColumns()).contains(
                "selected_model", "selected_reasoning_effort",
                "workspace_path"
        );
        assertThat(memoryItemColumns()).contains(
                "importance", "usage_count", "last_used_at",
                "source_type", "source_reference"
        );
        assertThat(memoryEnabledSetting()).isEqualTo("true");
        assertThat(memoryEnabledCreatedAt()).contains("T").endsWith("Z");

        // 对同一数据库重复执行迁移，必须只校验历史而不能再次建表。
        liquibase.afterPropertiesSet();

        assertThat(applicationChangeSetCount()).isEqualTo(23);
    }

    @Test
    void serializesSqliteWritesAndWaitsForTransientExternalLocks() {
        assertThat(dataSource).isInstanceOf(HikariDataSource.class);
        HikariDataSource hikari = (HikariDataSource) dataSource;
        Integer busyTimeout = jdbcTemplate.queryForObject(
                "PRAGMA busy_timeout",
                Integer.class
        );
        String journalMode = jdbcTemplate.queryForObject(
                "PRAGMA journal_mode",
                String.class
        );

        assertThat(hikari.getMaximumPoolSize()).isEqualTo(1);
        assertThat(hikari.getMinimumIdle()).isEqualTo(1);
        assertThat(busyTimeout).isGreaterThanOrEqualTo(10_000);
        assertThat(journalMode).isEqualToIgnoringCase("wal");
    }

    @Test
    void queuesConcurrentTransactionsInsteadOfExposingSqliteBusy() throws Exception {
        CountDownLatch firstWriteStarted = new CountDownLatch(1);
        CountDownLatch releaseFirstWrite = new CountDownLatch(1);
        ExecutorService writers = Executors.newFixedThreadPool(2);
        try {
            Future<?> first = writers.submit(() ->
                    transactionTemplate.executeWithoutResult(status -> {
                        insertTestSetting("concurrency.writer.first");
                        firstWriteStarted.countDown();
                        await(releaseFirstWrite);
                    })
            );
            assertThat(firstWriteStarted.await(5, TimeUnit.SECONDS)).isTrue();

            Future<Integer> second = writers.submit(() ->
                    insertTestSetting("concurrency.writer.second")
            );
            Thread.sleep(150);
            assertThat(second.isDone()).isFalse();

            releaseFirstWrite.countDown();
            first.get(5, TimeUnit.SECONDS);
            assertThat(second.get(5, TimeUnit.SECONDS)).isEqualTo(1);
            assertThat(jdbcTemplate.queryForObject(
                    """
                    SELECT COUNT(*)
                    FROM application_setting
                    WHERE setting_key LIKE 'concurrency.writer.%'
                    """,
                    Integer.class
            )).isEqualTo(2);
        } finally {
            releaseFirstWrite.countDown();
            writers.shutdownNow();
        }
    }

    private Integer applicationChangeSetCount() {
        return jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                FROM DATABASECHANGELOG
                WHERE ID IN (
                    '001-initial-schema',
                    '002-task-plan-step',
                    '003-task-plan-step-primary-key',
                    '004-conversation-message',
                    '005-conversation-reasoning',
                    '006-model-configuration',
                    '007-conversation-message-duration',
                    '008-model-context-window',
                    '009-memory-item',
                    '010-memory-semantic-slot',
                    '011-conversation-work-log',
                    '012-model-provider',
                    '013-provider-model',
                    '014-context-compaction-and-artifact',
                    '015-active-context-tokens',
                    '016-memory-lifecycle-and-ranking',
                    '017-application-setting',
                    '018-normalize-application-setting-timestamps',
                    '019-conversation-message-branches',
                    '020-model-reasoning-efforts',
                    '021-task-composer-preferences',
                    '022-model-web-search-capability',
                    '023-conversation-token-usage-details'
                )
                AND AUTHOR = 'lumora'
                """,
                Integer.class
        );
    }

    private Integer agentControlPlaneTableCount() {
        return jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                FROM sqlite_master
                WHERE type = 'table'
                  AND name IN (
                      'agent_session',
                      'agent_inbox_message',
                      'agent_activation',
                      'agent_checkpoint'
                  )
                """,
                Integer.class
        );
    }

    private Integer agentControlPlaneChangeSetCount() {
        return jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                FROM DATABASECHANGELOG
                WHERE ID = '028-agent-session-control-plane'
                  AND AUTHOR = 'lumora'
                """,
                Integer.class
        );
    }

    private Integer taskWorkspaceChangeSetCount() {
        return jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                FROM DATABASECHANGELOG
                WHERE ID = '029-task-workspace'
                  AND AUTHOR = 'lumora'
                """,
                Integer.class
        );
    }

    private int insertTestSetting(String key) {
        return jdbcTemplate.update(
                """
                INSERT INTO application_setting (
                    setting_key, setting_value, created_at, updated_at
                ) VALUES (?, 'true', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """,
                key
        );
    }

    private static void await(CountDownLatch latch) {
        try {
            latch.await();
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("并发写入测试被中断", error);
        }
    }

    private java.util.List<String> agentTaskColumns() {
        return jdbcTemplate.query(
                "PRAGMA table_info(agent_task)",
                (resultSet, rowNumber) -> resultSet.getString("name")
        );
    }

    private java.util.List<String> modelConfigurationColumns() {
        return jdbcTemplate.query(
                "PRAGMA table_info(model_configuration)",
                (resultSet, rowNumber) -> resultSet.getString("name")
        );
    }

    private java.util.List<String> conversationMessageColumns() {
        return jdbcTemplate.query(
                "PRAGMA table_info(conversation_message)",
                (resultSet, rowNumber) -> resultSet.getString("name")
        );
    }

    private java.util.List<String> providerModelColumns() {
        return jdbcTemplate.query(
                "PRAGMA table_info(model_configuration_model)",
                (resultSet, rowNumber) -> resultSet.getString("name")
        );
    }

    private java.util.List<String> memoryItemColumns() {
        return jdbcTemplate.query(
                "PRAGMA table_info(memory_item)",
                (resultSet, rowNumber) -> resultSet.getString("name")
        );
    }

    private String memoryEnabledSetting() {
        return jdbcTemplate.queryForObject(
                """
                SELECT setting_value
                FROM application_setting
                WHERE setting_key = 'memory.enabled'
                """,
                String.class
        );
    }

    private String memoryEnabledCreatedAt() {
        return jdbcTemplate.queryForObject(
                """
                SELECT created_at
                FROM application_setting
                WHERE setting_key = 'memory.enabled'
                """,
                String.class
        );
    }

    private java.util.List<String> taskPlanStepPrimaryKeyColumns() {
        return jdbcTemplate.query(
                "PRAGMA table_info(task_plan_step)",
                (resultSet, rowNumber) -> new ColumnMetadata(
                        resultSet.getString("name"),
                        resultSet.getInt("pk")
                )
        ).stream()
                .filter(column -> column.primaryKeyOrder() > 0)
                .sorted(java.util.Comparator.comparingInt(
                        ColumnMetadata::primaryKeyOrder
                ))
                .map(ColumnMetadata::name)
                .toList();
    }

    private static class ColumnMetadata {

        private final String name;
        private final int primaryKeyOrder;

        private ColumnMetadata(String name, int primaryKeyOrder) {
            this.name = name;
            this.primaryKeyOrder = primaryKeyOrder;
        }

        private String name() {
            return name;
        }

        private int primaryKeyOrder() {
            return primaryKeyOrder;
        }
    }
}
