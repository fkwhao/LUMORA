package com.lumora.core.controller;

import com.lumora.core.common.constant.ApiPathConstants;
import com.lumora.core.common.constant.CoreMetadataConstants;
import com.lumora.core.config.CoreProperties;
import com.lumora.core.dto.response.CoreHealthResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping(ApiPathConstants.HEALTH)
public class CoreHealthController {

    private final CoreProperties properties;

    @GetMapping
    public CoreHealthResponse health() {
        // 健康接口保留在 /api 下，由现有会话令牌过滤器统一认证。
        return new CoreHealthResponse(
                CoreMetadataConstants.SERVICE_NAME,
                CoreMetadataConstants.SERVICE_VERSION,
                properties.getProtocolVersion()
        );
    }
}
