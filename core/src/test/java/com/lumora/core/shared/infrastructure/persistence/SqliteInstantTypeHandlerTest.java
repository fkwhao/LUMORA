package com.lumora.core.shared.infrastructure.persistence;

import com.lumora.core.shared.infrastructure.persistence.SqliteInstantTypeHandler;
import org.junit.jupiter.api.Test;

import java.sql.ResultSet;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SqliteInstantTypeHandlerTest {

    private final SqliteInstantTypeHandler handler =
            new SqliteInstantTypeHandler();

    @Test
    void readsIsoInstant() throws Exception {
        ResultSet resultSet = resultSet("2026-08-06T03:30:28Z");

        assertThat(handler.getNullableResult(resultSet, "created_at"))
                .isEqualTo(Instant.parse("2026-08-06T03:30:28Z"));
    }

    @Test
    void readsSqliteCurrentTimestampAsUtc() throws Exception {
        ResultSet resultSet = resultSet("2026-08-06 03:30:28");

        assertThat(handler.getNullableResult(resultSet, "created_at"))
                .isEqualTo(Instant.parse("2026-08-06T03:30:28Z"));
    }

    @Test
    void readsLegacyEpochMilliseconds() throws Exception {
        ResultSet resultSet = resultSet("1785987028000");

        assertThat(handler.getNullableResult(resultSet, "created_at"))
                .isEqualTo(Instant.ofEpochMilli(1785987028000L));
    }

    private static ResultSet resultSet(String value) throws Exception {
        ResultSet resultSet = mock(ResultSet.class);
        when(resultSet.getString("created_at")).thenReturn(value);
        return resultSet;
    }
}
