package com.lumora.core.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class CreateTaskRequest {

    @NotBlank(message = "任务目标不能为空")
    @Size(max = 2000, message = "任务目标不能超过 2000 个字符")
    private String goal;

    public CreateTaskRequest() {
    }

    public String getGoal() {
        return goal;
    }

    public void setGoal(String goal) {
        this.goal = goal;
    }
}
