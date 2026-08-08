package com.lumora.core.conversation.api.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.util.List;

public class ChatCompletionRequest {

    @Valid
    @NotEmpty(message = "对话消息不能为空")
    @Size(max = 100, message = "单次对话消息数量不能超过 100")
    private List<ChatMessageRequest> messages;

    public List<ChatMessageRequest> getMessages() {
        return messages;
    }

    public void setMessages(List<ChatMessageRequest> messages) {
        this.messages = messages;
    }
}
