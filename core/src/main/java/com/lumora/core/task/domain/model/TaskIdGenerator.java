package com.lumora.core.task.domain.model;

import java.util.UUID;

public class TaskIdGenerator {

    public String generate() {
        return UUID.randomUUID().toString();
    }
}
