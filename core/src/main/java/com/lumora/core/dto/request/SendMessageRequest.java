package com.lumora.core.dto.request;

import com.lumora.core.common.constant.ConversationConstants;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class SendMessageRequest {

    @NotBlank(message = "消息内容不能为空")
    @Size(
            max = ConversationConstants.MAX_MESSAGE_LENGTH,
            message = "消息内容过长"
    )
    private String content;

    public SendMessageRequest() {
    }

    public SendMessageRequest(String content) {
        this.content = content;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }
}
