package com.lumora.core.config;

import liquibase.integration.spring.SpringLiquibase;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.nio.file.Path;
import java.util.UUID;

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
                      'model_configuration'
                  )
                """,
                Integer.class
        );
        Integer foreignKeysEnabled = jdbcTemplate.queryForObject(
                "PRAGMA foreign_keys",
                Integer.class
        );

        assertThat(businessTableCount).isEqualTo(6);
        assertThat(foreignKeysEnabled).isEqualTo(1);
        assertThat(applicationChangeSetCount()).isEqualTo(6);
        assertThat(taskPlanStepPrimaryKeyColumns())
                .containsExactly("plan_step_id");

        // 对同一数据库重复执行迁移，必须只校验历史而不能再次建表。
        liquibase.afterPropertiesSet();

        assertThat(applicationChangeSetCount()).isEqualTo(6);
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
                    '006-model-configuration'
                )
                AND AUTHOR = 'lumora'
                """,
                Integer.class
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
