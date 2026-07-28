package com.lumora.core.agent.exception;

public class AgentRuntimeException extends RuntimeException {

    public AgentRuntimeException(String message) {
        super(message);
    }

    public AgentRuntimeException(String message, Throwable cause) {
        super(message, cause);
    }
}
