package com.lumora.core.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.lumora.core.mapper.typehandler.SqliteInstantTypeHandler;

import java.time.Instant;

@TableName(value = "memory_item", autoResultMap = true)
public class MemoryItem {

    @TableId(value = "memory_id", type = IdType.INPUT)
    private String memoryId;
    @TableField("scope_type")
    private MemoryScopeType scopeType;
    @TableField("scope_id")
    private String scopeId;
    @TableField("memory_type")
    private MemoryType memoryType;
    @TableField("content")
    private String content;
    @TableField("structured_data_json")
    private String structuredDataJson;
    @TableField("confidence")
    private double confidence;
    @TableField("source_message_id")
    private String sourceMessageId;
    @TableField("content_hash")
    private String contentHash;
    @TableField("dedupe_key")
    private String dedupeKey;
    @TableField("subject")
    private String subject;
    @TableField("predicate")
    private String predicate;
    @TableField("value")
    private String value;
    @TableField("version")
    private int version;
    @TableField("status")
    private MemoryStatus status;
    @TableField(value = "expires_at", typeHandler = SqliteInstantTypeHandler.class)
    private Instant expiresAt;
    @TableField(value = "created_at", typeHandler = SqliteInstantTypeHandler.class)
    private Instant createdAt;
    @TableField(value = "updated_at", typeHandler = SqliteInstantTypeHandler.class)
    private Instant updatedAt;

    public MemoryItem() {
    }

    public MemoryItem(
            String memoryId,
            MemoryScopeType scopeType,
            String scopeId,
            MemoryType memoryType,
            String content,
            String structuredDataJson,
            double confidence,
            String sourceMessageId,
            String contentHash,
            String dedupeKey,
            String subject,
            String predicate,
            String value,
            int version,
            MemoryStatus status,
            Instant expiresAt,
            Instant createdAt,
            Instant updatedAt
    ) {
        this.memoryId = memoryId;
        this.scopeType = scopeType;
        this.scopeId = scopeId;
        this.memoryType = memoryType;
        this.content = content;
        this.structuredDataJson = structuredDataJson;
        this.confidence = confidence;
        this.sourceMessageId = sourceMessageId;
        this.contentHash = contentHash;
        this.dedupeKey = dedupeKey;
        this.subject = subject;
        this.predicate = predicate;
        this.value = value;
        this.version = version;
        this.status = status;
        this.expiresAt = expiresAt;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public String getMemoryId() { return memoryId; }
    public void setMemoryId(String memoryId) { this.memoryId = memoryId; }
    public MemoryScopeType getScopeType() { return scopeType; }
    public void setScopeType(MemoryScopeType scopeType) { this.scopeType = scopeType; }
    public String getScopeId() { return scopeId; }
    public void setScopeId(String scopeId) { this.scopeId = scopeId; }
    public MemoryType getMemoryType() { return memoryType; }
    public void setMemoryType(MemoryType memoryType) { this.memoryType = memoryType; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public String getStructuredDataJson() { return structuredDataJson; }
    public void setStructuredDataJson(String structuredDataJson) { this.structuredDataJson = structuredDataJson; }
    public double getConfidence() { return confidence; }
    public void setConfidence(double confidence) { this.confidence = confidence; }
    public String getSourceMessageId() { return sourceMessageId; }
    public void setSourceMessageId(String sourceMessageId) { this.sourceMessageId = sourceMessageId; }
    public String getContentHash() { return contentHash; }
    public void setContentHash(String contentHash) { this.contentHash = contentHash; }
    public String getDedupeKey() { return dedupeKey; }
    public void setDedupeKey(String dedupeKey) { this.dedupeKey = dedupeKey; }
    public String getSubject() { return subject; }
    public void setSubject(String subject) { this.subject = subject; }
    public String getPredicate() { return predicate; }
    public void setPredicate(String predicate) { this.predicate = predicate; }
    public String getValue() { return value; }
    public void setValue(String value) { this.value = value; }
    public int getVersion() { return version; }
    public void setVersion(int version) { this.version = version; }
    public MemoryStatus getStatus() { return status; }
    public void setStatus(MemoryStatus status) { this.status = status; }
    public Instant getExpiresAt() { return expiresAt; }
    public void setExpiresAt(Instant expiresAt) { this.expiresAt = expiresAt; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
