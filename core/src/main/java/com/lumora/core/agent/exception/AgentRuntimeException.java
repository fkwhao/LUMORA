package com.lumora.core.agent.exception;

public class AgentRuntimeException extends RuntimeException {
    private static final String DEFAULT_CODE = "AGENT_RUNTIME_ERROR";
    private final String code;

    public AgentRuntimeException(String message) {
        this(DEFAULT_CODE, message, null);
    }

    public AgentRuntimeException(String message, Throwable cause) {
        this(DEFAULT_CODE, message, cause);
    }

    public AgentRuntimeException(String code, String message) {
        this(code, message, null);
    }

    public AgentRuntimeException(String code, String message, Throwable cause) {
        super(message, cause);
        this.code = code == null || code.isBlank() ? DEFAULT_CODE : code;
    }

    public String getCode() {
        return code;
    }
}
