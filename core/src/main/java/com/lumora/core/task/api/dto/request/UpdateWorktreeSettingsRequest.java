package com.lumora.core.task.api.dto.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

public class UpdateWorktreeSettingsRequest {

    @NotNull(message = "autoApplyWhenClean 不能为空")
    private Boolean autoApplyWhenClean;

    @PositiveOrZero(message = "expectedSettingsRevision 不能小于 0")
    private long expectedSettingsRevision;

    public Boolean getAutoApplyWhenClean() {
        return autoApplyWhenClean;
    }

    public void setAutoApplyWhenClean(Boolean autoApplyWhenClean) {
        this.autoApplyWhenClean = autoApplyWhenClean;
    }

    public long getExpectedSettingsRevision() {
        return expectedSettingsRevision;
    }

    public void setExpectedSettingsRevision(long expectedSettingsRevision) {
        this.expectedSettingsRevision = expectedSettingsRevision;
    }
}
