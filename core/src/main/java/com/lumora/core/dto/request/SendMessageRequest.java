package com.lumora.core.dto.request;

import com.lumora.core.common.constant.ConversationConstants;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public class SendMessageRequest {

    @NotBlank(message = "消息内容不能为空")
    @Size(
            max = ConversationConstants.MAX_MESSAGE_LENGTH,
            message = "消息内容过长"
    )
    private String content;

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
