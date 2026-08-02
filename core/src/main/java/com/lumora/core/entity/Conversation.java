package com.lumora.core.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.lumora.core.mapper.typehandler.SqliteInstantTypeHandler;

import java.time.Instant;

@TableName(value = "conversation", autoResultMap = true)
public class Conversation {

    @TableId(value = "conversation_id", type = IdType.INPUT)
    private String conversationId;
    @TableField("task_id")
    private String taskId;
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

    public Conversation() {
    }

    public Conversation(
            String conversationId,
            String taskId,
            Instant createdAt,
            Instant updatedAt
    ) {
        this.conversationId = conversationId;
        this.taskId = taskId;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public String getConversationId() {
        return conversationId;
    }

    public void setConversationId(String conversationId) {
        this.conversationId = conversationId;
    }

    public String getTaskId() {
        return taskId;
    }

    public void setTaskId(String taskId) {
        this.taskId = taskId;
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
