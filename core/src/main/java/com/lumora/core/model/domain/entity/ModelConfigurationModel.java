package com.lumora.core.model.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.lumora.core.shared.infrastructure.persistence.SqliteInstantTypeHandler;

import java.time.Instant;

@TableName(value = "model_configuration_model", autoResultMap = true)
public class ModelConfigurationModel {
    @TableId(value = "model_configuration_model_id", type = IdType.INPUT)
    private String modelConfigurationModelId;
    @TableField("configuration_id")
    private String configurationId;
    @TableField("model_id")
    private String modelId;
    @TableField("context_window")
    private int contextWindow;
    @TableField("max_output_tokens")
    private int maxOutputTokens;
    @TableField("reasoning_efforts")
    private String reasoningEfforts;
    @TableField("web_search_enabled")
    private boolean webSearchEnabled;
    @TableField(value = "created_at", typeHandler = SqliteInstantTypeHandler.class)
    private Instant createdAt;
    @TableField(value = "updated_at", typeHandler = SqliteInstantTypeHandler.class)
    private Instant updatedAt;

    public ModelConfigurationModel() {}

    public ModelConfigurationModel(String id, String configurationId,
            String modelId, int contextWindow, int maxOutputTokens,
            String reasoningEfforts,
            Instant createdAt, Instant updatedAt) {
        this(id, configurationId, modelId, contextWindow, maxOutputTokens,
                reasoningEfforts, false, createdAt, updatedAt);
    }

    public ModelConfigurationModel(String id, String configurationId,
            String modelId, int contextWindow, int maxOutputTokens,
            String reasoningEfforts, boolean webSearchEnabled,
            Instant createdAt, Instant updatedAt) {
        this.modelConfigurationModelId = id;
        this.configurationId = configurationId;
        this.modelId = modelId;
        this.contextWindow = contextWindow;
        this.maxOutputTokens = maxOutputTokens;
        this.reasoningEfforts = reasoningEfforts;
        this.webSearchEnabled = webSearchEnabled;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public String getModelConfigurationModelId() { return modelConfigurationModelId; }
    public String getConfigurationId() { return configurationId; }
    public String getModelId() { return modelId; }
    public void setModelId(String modelId) { this.modelId = modelId; }
    public int getContextWindow() { return contextWindow; }
    public void setContextWindow(int contextWindow) { this.contextWindow = contextWindow; }
    public int getMaxOutputTokens() { return maxOutputTokens; }
    public void setMaxOutputTokens(int maxOutputTokens) { this.maxOutputTokens = maxOutputTokens; }
    public String getReasoningEfforts() { return reasoningEfforts; }
    public void setReasoningEfforts(String reasoningEfforts) { this.reasoningEfforts = reasoningEfforts; }
    public boolean isWebSearchEnabled() { return webSearchEnabled; }
    public void setWebSearchEnabled(boolean webSearchEnabled) { this.webSearchEnabled = webSearchEnabled; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
