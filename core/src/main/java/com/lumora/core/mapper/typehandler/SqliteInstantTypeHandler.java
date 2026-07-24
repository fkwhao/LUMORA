package com.lumora.core.mapper.typehandler;

import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;

import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;

/**
 * 以 ISO-8601 字符串读写 SQLite TEXT 时间列，避免驱动混用毫秒值和日期格式。
 */
public class SqliteInstantTypeHandler extends BaseTypeHandler<Instant> {

    @Override
    public void setNonNullParameter(
            PreparedStatement statement,
            int index,
            Instant parameter,
            JdbcType jdbcType
    ) throws SQLException {
        statement.setString(index, parameter.toString());
    }

    @Override
    public Instant getNullableResult(
            ResultSet resultSet,
            String columnName
    ) throws SQLException {
        return parse(resultSet.getString(columnName));
    }

    @Override
    public Instant getNullableResult(
            ResultSet resultSet,
            int columnIndex
    ) throws SQLException {
        return parse(resultSet.getString(columnIndex));
    }

    @Override
    public Instant getNullableResult(
            CallableStatement statement,
            int columnIndex
    ) throws SQLException {
        return parse(statement.getString(columnIndex));
    }

    private static Instant parse(String value) {
        if (value == null) {
            return null;
        }
        try {
            // 兼容旧版默认处理器写入 SQLite TEXT 列的 epoch 毫秒值。
            return Instant.ofEpochMilli(Long.parseLong(value));
        } catch (NumberFormatException ignored) {
            return Instant.parse(value);
        }
    }
}
