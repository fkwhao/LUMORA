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
    void appliesInitialSchemaOnlyOnceToTheSameDatabase() throws Exception {
        Integer businessTableCount = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                FROM sqlite_master
                WHERE type = 'table'
                  AND name IN ('agent_task', 'approval_request')
                """,
                Integer.class
        );
        Integer foreignKeysEnabled = jdbcTemplate.queryForObject(
                "PRAGMA foreign_keys",
                Integer.class
        );

        assertThat(businessTableCount).isEqualTo(2);
        assertThat(foreignKeysEnabled).isEqualTo(1);
        assertThat(initialChangeSetCount()).isEqualTo(1);

        // 对同一数据库重复执行迁移，必须只校验历史而不能再次建表。
        liquibase.afterPropertiesSet();

        assertThat(initialChangeSetCount()).isEqualTo(1);
    }

    private Integer initialChangeSetCount() {
        return jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                FROM DATABASECHANGELOG
                WHERE ID = '001-initial-schema'
                  AND AUTHOR = 'lumora'
                """,
                Integer.class
        );
    }
}
