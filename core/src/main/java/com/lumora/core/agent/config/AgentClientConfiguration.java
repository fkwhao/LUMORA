package com.lumora.core.agent.config;

import com.lumora.core.agent.constant.AgentClientConstants;
import com.lumora.core.config.CoreProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.net.URI;
import java.net.http.HttpClient;
@Configuration
public class AgentClientConfiguration {

    @Bean
    public RestClient agentRestClient(CoreProperties properties) {
        URI agentUri = validateAgentUri(properties.getAgentUrl());
        HttpClient httpClient = HttpClient.newBuilder()
                .connectTimeout(AgentClientConstants.REQUEST_TIMEOUT)
                .build();
        JdkClientHttpRequestFactory requestFactory =
                new JdkClientHttpRequestFactory(httpClient);
        requestFactory.setReadTimeout(
                AgentClientConstants.REQUEST_TIMEOUT
        );

        return RestClient.builder()
                .baseUrl(agentUri.toString())
                .requestFactory(requestFactory)
                .build();
    }

    public static URI validateAgentUri(String agentUrl) {
        URI uri;
        try {
            uri = URI.create(agentUrl);
        } catch (IllegalArgumentException error) {
            throw new IllegalArgumentException("Python Agent URL 格式无效", error);
        }

        // Core 只允许访问本机 Agent，避免配置错误把任务与令牌发送到远程地址。
        if (!"http".equals(uri.getScheme())
                || !"127.0.0.1".equals(uri.getHost())
                || uri.getPort() < 1
                || uri.getPort() > 65535
                || uri.getPath() != null && !uri.getPath().isEmpty()
                || uri.getQuery() != null
                || uri.getFragment() != null) {
            throw new IllegalArgumentException(
                    "Python Agent URL 必须是 http://127.0.0.1:<port>"
            );
        }
        return uri;
    }
}
