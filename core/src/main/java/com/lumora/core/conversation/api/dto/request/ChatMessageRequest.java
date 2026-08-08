package com.lumora.core.conversation.api.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public class ChatMessageRequest {

    @NotBlank(message = "消息角色不能为空")
    @Pattern(
            regexp = "user|assistant",
            message = "消息角色只能是 user 或 assistant"
    )
    private String role;
    @NotBlank(message = "消息内容不能为空")
    @Size(max = 100000, message = "消息内容过长")
    private String content;

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }
}
