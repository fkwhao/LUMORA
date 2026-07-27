package com.lumora.core.controller;

import com.lumora.core.config.CoreProperties;
import com.lumora.core.dto.response.CoreHealthResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/health")
public class CoreHealthController {

    private static final String SERVICE_NAME = "lumora-core";
    private static final String SERVICE_VERSION = "0.1.0";

    private final CoreProperties properties;

    public CoreHealthController(CoreProperties properties) {
        this.properties = properties;
    }

    @GetMapping
    public CoreHealthResponse health() {
        // 健康接口保留在 /api 下，由现有会话令牌过滤器统一认证。
        return new CoreHealthResponse(
                SERVICE_NAME,
                SERVICE_VERSION,
                properties.getProtocolVersion()
        );
    }
}
