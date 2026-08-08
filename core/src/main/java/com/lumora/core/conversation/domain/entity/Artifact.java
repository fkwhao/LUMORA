package com.lumora.core.conversation.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.lumora.core.shared.infrastructure.persistence.SqliteInstantTypeHandler;

import java.time.Instant;

@TableName(value = "artifact", autoResultMap = true)
public class Artifact {
    @TableId(value = "artifact_id", type = IdType.INPUT)
    private String artifactId;
    @TableField("task_id") private String taskId;
    @TableField("conversation_id") private String conversationId;
    @TableField("storage_scope_id") private String storageScopeId;
    @TableField("source_tool_call_id") private String sourceToolCallId;
    @TableField("mime_type") private String mimeType;
    @TableField("byte_size") private long byteSize;
    @TableField("character_count") private long characterCount;
    @TableField("estimated_tokens") private int estimatedTokens;
    @TableField("sha256") private String sha256;
    @TableField("status") private String status;
    @TableField(value = "created_at", typeHandler = SqliteInstantTypeHandler.class)
    private Instant createdAt;

    public Artifact() {}

    public Artifact(String artifactId, String taskId, String conversationId,
            String storageScopeId, String sourceToolCallId, String mimeType,
            long byteSize, long characterCount, int estimatedTokens,
            String sha256, String status, Instant createdAt) {
        this.artifactId = artifactId;
        this.taskId = taskId;
        this.conversationId = conversationId;
        this.storageScopeId = storageScopeId;
        this.sourceToolCallId = sourceToolCallId;
        this.mimeType = mimeType;
        this.byteSize = byteSize;
        this.characterCount = characterCount;
        this.estimatedTokens = estimatedTokens;
        this.sha256 = sha256;
        this.status = status;
        this.createdAt = createdAt;
    }

    public String getArtifactId() { return artifactId; }
    public String getTaskId() { return taskId; }
    public String getConversationId() { return conversationId; }
    public String getStorageScopeId() { return storageScopeId; }
    public String getSourceToolCallId() { return sourceToolCallId; }
    public String getMimeType() { return mimeType; }
    public long getByteSize() { return byteSize; }
    public long getCharacterCount() { return characterCount; }
    public int getEstimatedTokens() { return estimatedTokens; }
    public String getSha256() { return sha256; }
    public String getStatus() { return status; }
    public Instant getCreatedAt() { return createdAt; }
}
