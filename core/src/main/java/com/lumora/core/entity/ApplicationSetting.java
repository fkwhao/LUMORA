package com.lumora.core.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.lumora.core.mapper.typehandler.SqliteInstantTypeHandler;

import java.time.Instant;

@TableName(value = "application_setting", autoResultMap = true)
public class ApplicationSetting {

    @TableId(value = "setting_key", type = IdType.INPUT)
    private String settingKey;
    @TableField("setting_value")
    private String settingValue;
    @TableField(
            value = "created_at",
            typeHandler = SqliteInstantTypeHandler.class
    )
    private Instant createdAt;
    @TableField(
            value = "updated_at",
            typeHandler = SqliteInstantTypeHandler.class
    )
    private Instant updatedAt;

    public ApplicationSetting() {
    }

    public ApplicationSetting(
            String settingKey,
            String settingValue,
            Instant createdAt,
            Instant updatedAt
    ) {
        this.settingKey = settingKey;
        this.settingValue = settingValue;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public String getSettingKey() { return settingKey; }
    public void setSettingKey(String settingKey) { this.settingKey = settingKey; }
    public String getSettingValue() { return settingValue; }
    public void setSettingValue(String settingValue) { this.settingValue = settingValue; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
