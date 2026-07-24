package com.lumora.core.dto.response;

import java.time.Instant;

public class ErrorResponse {

    private final String code;
    private final String message;
    private final Instant timestamp;

    public ErrorResponse(String code, String message) {
        this.code = code;
        this.message = message;
        this.timestamp = Instant.now();
    }

    public String getCode() {
        return code;
    }

    public String getMessage() {
        return message;
    }

    public Instant getTimestamp() {
        return timestamp;
    }
}
