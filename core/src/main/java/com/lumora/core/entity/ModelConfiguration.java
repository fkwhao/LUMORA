package com.lumora.core.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.lumora.core.mapper.typehandler.SqliteInstantTypeHandler;

import java.time.Instant;

@TableName(value = "model_configuration", autoResultMap = true)
public class ModelConfiguration {

    @TableId(value = "configuration_id", type = IdType.INPUT)
    private String configurationId;
    @TableField("provider_name")
    private String providerName;
    @TableField("base_url")
    private String baseUrl;
    @TableField("model_name")
    private String modelName;
    @TableField("context_window")
    private int contextWindow;
    @TableField("api_format")
    private String apiFormat;
    @TableField("is_active")
    private boolean active;
    @TableField("api_key_ciphertext")
    private String apiKeyCiphertext;
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

    public ModelConfiguration() {
    }

    public ModelConfiguration(
            String configurationId,
            String providerName,
            String baseUrl,
            String modelName,
            int contextWindow,
            String apiKeyCiphertext,
            Instant createdAt,
            Instant updatedAt
    ) {
        this(configurationId, providerName, baseUrl, modelName,
                contextWindow, apiKeyCiphertext, "chat-completions", true,
                createdAt, updatedAt);
    }

    public ModelConfiguration(
            String configurationId,
            String providerName,
            String baseUrl,
            String modelName,
            int contextWindow,
            String apiKeyCiphertext,
            String apiFormat,
            boolean active,
            Instant createdAt,
            Instant updatedAt
    ) {
        this.configurationId = configurationId;
        this.providerName = providerName;
        this.baseUrl = baseUrl;
        this.modelName = modelName;
        this.contextWindow = contextWindow;
        this.apiKeyCiphertext = apiKeyCiphertext;
        this.apiFormat = apiFormat;
        this.active = active;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public String getConfigurationId() {
        return configurationId;
    }

    public void setConfigurationId(String configurationId) {
        this.configurationId = configurationId;
    }

    public String getProviderName() {
        return providerName;
    }

    public void setProviderName(String providerName) {
        this.providerName = providerName;
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public void setBaseUrl(String baseUrl) {
        this.baseUrl = baseUrl;
    }

    public String getModelName() {
        return modelName;
    }

    public void setModelName(String modelName) {
        this.modelName = modelName;
    }

    public int getContextWindow() {
        return contextWindow;
    }

    public void setContextWindow(int contextWindow) {
        this.contextWindow = contextWindow;
    }

    public String getApiKeyCiphertext() {
        return apiKeyCiphertext;
    }

    public void setApiKeyCiphertext(String apiKeyCiphertext) {
        this.apiKeyCiphertext = apiKeyCiphertext;
    }

    public String getApiFormat() {
        return apiFormat;
    }

    public void setApiFormat(String apiFormat) {
        this.apiFormat = apiFormat;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
