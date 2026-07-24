package com.lumora.core.common;

import java.util.UUID;

public class TaskIdGenerator {

    public String generate() {
        return UUID.randomUUID().toString();
    }
}
