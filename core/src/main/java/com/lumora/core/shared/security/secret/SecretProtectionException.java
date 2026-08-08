package com.lumora.core.shared.security.secret;

public class SecretProtectionException extends RuntimeException {

    public SecretProtectionException(String message) {
        super(message);
    }

    public SecretProtectionException(String message, Throwable cause) {
        super(message, cause);
    }
}
