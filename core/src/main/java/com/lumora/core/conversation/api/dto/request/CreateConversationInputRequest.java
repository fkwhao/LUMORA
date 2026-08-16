package com.lumora.core.conversation.api.dto.request;

import com.lumora.core.conversation.domain.model.ConversationConstants;
import com.lumora.core.conversation.domain.model.ConversationInputTarget;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record CreateConversationInputRequest(
        @NotBlank(message = "消息内容不能为空")
        @Size(max = ConversationConstants.MAX_MESSAGE_LENGTH,
                message = "消息内容过长")
        String content,
        @NotNull(message = "队列目标不能为空")
        ConversationInputTarget target,
        @Size(max = 160, message = "模型名称过长")
        String model,
        @Pattern(regexp = "none|low|high|max", message = "推理强度无效")
        String reasoningEffort,
        @Size(max = 1000, message = "工作区路径过长")
        String workspacePath,
        @Pattern(regexp = "full_access|auto_approve|request_approval",
                message = "权限模式无效")
        String permissionMode,
        @Positive(message = "队列位置必须大于 0")
        Long position
) {
}
