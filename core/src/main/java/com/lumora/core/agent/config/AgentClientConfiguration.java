package com.lumora.core.agent.config;

import com.lumora.core.agent.client.http.AgentRuntimeHttpApi;
import com.lumora.core.agent.constant.AgentClientConstants;
import com.lumora.core.common.constant.HttpContractConstants;
import com.lumora.core.config.CoreProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.support.RestClientAdapter;
import org.springframework.web.service.invoker.HttpServiceProxyFactory;

import java.net.URI;
import java.net.http.HttpClient;

@Configuration
public class AgentClientConfiguration {

    @Bean
    @Primary
    public RestClient agentRestClient(CoreProperties properties) {
        return buildAgentRestClient(
                properties,
                AgentClientConstants.REQUEST_TIMEOUT
        );
    }

    @Bean("agentSseRestClient")
    public RestClient agentSseRestClient(CoreProperties properties) {
        return buildAgentRestClient(
                properties,
                AgentClientConstants.STREAM_READ_TIMEOUT
        );
    }

    private RestClient buildAgentRestClient(
            CoreProperties properties,
            java.time.Duration readTimeout
    ) {
        URI agentUri = validateAgentUri(properties.getAgentUrl());
        HttpClient httpClient = HttpClient.newBuilder()
                .connectTimeout(AgentClientConstants.REQUEST_TIMEOUT)
                // Uvicorn 提供 HTTP/1.1 REST 服务，禁止 JDK 客户端发起无意义的 h2c 升级。
                .version(HttpClient.Version.HTTP_1_1)
                .build();
        JdkClientHttpRequestFactory requestFactory =
                new JdkClientHttpRequestFactory(httpClient);
        if (!readTimeout.isZero()) {
            requestFactory.setReadTimeout(readTimeout);
        }

        return RestClient.builder()
                .baseUrl(agentUri.toString())
                .requestFactory(requestFactory)
                // 固定内部协议 Header 统一由 Client 配置维护，业务调用只传关联 ID。
                .defaultHeader(
                        HttpHeaders.AUTHORIZATION,
                        HttpContractConstants.BEARER_PREFIX
                                + properties.getAgentStartupToken()
                )
                .defaultHeader(
                        HttpContractConstants.PROTOCOL_VERSION_HEADER,
                        properties.getProtocolVersion()
                )
                .build();
    }

    @Bean
    public AgentRuntimeHttpApi agentRuntimeHttpApi(RestClient agentRestClient) {
        RestClientAdapter adapter = RestClientAdapter.create(agentRestClient);
        return HttpServiceProxyFactory.builderFor(adapter)
                .build()
                .createClient(AgentRuntimeHttpApi.class);
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
