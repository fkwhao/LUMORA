package com.lumora.core.conversation.api.dto.request;

import com.lumora.core.conversation.domain.model.ConversationConstants;
import com.lumora.core.conversation.domain.model.ConversationInputTarget;
import com.lumora.core.conversation.domain.model.MessageAttachment;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.util.List;

public record UpdateConversationInputRequest(
        @Size(min = 1, max = ConversationConstants.MAX_MESSAGE_LENGTH,
                message = "消息内容长度无效")
        String content,
        @Valid
        @Size(max = MessageAttachment.MAX_ATTACHMENTS,
                message = "一次最多添加 10 个附件")
        List<MessageAttachment> attachments,
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
