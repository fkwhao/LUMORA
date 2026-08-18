package com.lumora.core.conversation.api.dto.request;

import com.lumora.core.conversation.domain.model.ConversationConstants;
import com.lumora.core.conversation.domain.model.MessageAttachment;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;

public class SendMessageRequest {

    @NotBlank(message = "消息内容不能为空")
    @Size(
            max = ConversationConstants.MAX_MESSAGE_LENGTH,
            message = "消息内容过长"
    )
    private String content;

    @Valid
    @Size(max = MessageAttachment.MAX_ATTACHMENTS,
            message = "一次最多添加 10 个附件")
    private List<MessageAttachment> attachments = List.of();

    @Size(max = 160, message = "模型名称过长")
    private String model;

    @Pattern(
            regexp = "none|low|high|max",
            message = "推理强度无效"
    )
    private String reasoningEffort;

    @Size(max = 1000, message = "工作区路径过长")
    private String workspacePath;

    @Pattern(
            regexp = "full_access|auto_approve|request_approval",
            message = "权限模式无效"
    )
    private String permissionMode = "request_approval";

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

    public List<MessageAttachment> getAttachments() {
        return MessageAttachment.normalize(attachments);
    }

    public void setAttachments(List<MessageAttachment> attachments) {
        this.attachments = attachments == null ? List.of() : attachments;
    }

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public String getReasoningEffort() {
        return reasoningEffort;
    }

    public void setReasoningEffort(String reasoningEffort) {
        this.reasoningEffort = reasoningEffort;
    }

    public String getWorkspacePath() {
        return workspacePath;
    }

    public void setWorkspacePath(String workspacePath) {
        this.workspacePath = workspacePath;
    }

    public String getPermissionMode() {
        return permissionMode == null || permissionMode.isBlank()
                ? "request_approval"
                : permissionMode;
    }

    public void setPermissionMode(String permissionMode) {
        this.permissionMode = permissionMode;
    }
}
