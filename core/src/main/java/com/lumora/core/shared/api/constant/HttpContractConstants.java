package com.lumora.core.shared.api.constant;

/**
 * 本机进程间 HTTP 契约使用的 Header 与认证格式。
 */
public final class HttpContractConstants {

    public static final String BEARER_PREFIX = "Bearer ";
    public static final String CORRELATION_ID_HEADER = "X-Correlation-Id";
    public static final String PROTOCOL_VERSION_HEADER =
            "X-Lumora-Protocol-Version";

    private HttpContractConstants() {
    }
}
