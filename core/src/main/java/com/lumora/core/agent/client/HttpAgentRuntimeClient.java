package com.lumora.core.agent.client;

import com.lumora.core.agent.config.AgentClientConfiguration;
import com.lumora.core.agent.constant.AgentClientConstants;
import com.lumora.core.agent.dto.request.AgentPlanTaskRequest;
import com.lumora.core.agent.dto.response.AgentPlanStepResponse;
import com.lumora.core.agent.dto.response.AgentPlanTaskResponse;
import com.lumora.core.agent.exception.AgentRuntimeException;
import com.lumora.core.agent.model.AgentPlanStep;
import com.lumora.core.common.constant.HttpContractConstants;
import com.lumora.core.config.CoreProperties;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.List;

@Component
public class HttpAgentRuntimeClient implements AgentRuntimeClient {

    private final RestClient restClient;
    private final CoreProperties properties;

    public HttpAgentRuntimeClient(
            RestClient restClient,
            CoreProperties properties
    ) {
        AgentClientConfiguration.validateAgentUri(properties.getAgentUrl());
        this.restClient = restClient;
        this.properties = properties;
    }

    @Override
    public List<AgentPlanStep> planTask(
            String taskId,
            String goal,
            String correlationId
    ) {
        try {
            AgentPlanTaskResponse response = restClient.post()
                    .uri(AgentClientConstants.PLAN_TASK_PATH)
                    // 内部令牌只写入本次 HTTP 请求头，禁止拼入 URL、日志或异常信息。
                    .header(
                            HttpHeaders.AUTHORIZATION,
                            HttpContractConstants.BEARER_PREFIX
                                    + properties.getAgentStartupToken()
                    )
                    .header(
                            HttpContractConstants.PROTOCOL_VERSION_HEADER,
                            properties.getProtocolVersion()
                    )
                    .header(
                            HttpContractConstants.CORRELATION_ID_HEADER,
                            correlationId
                    )
                    .body(new AgentPlanTaskRequest(taskId, goal))
                    .retrieve()
                    .body(AgentPlanTaskResponse.class);

            if (response == null) {
                throw new AgentRuntimeException("Python Agent 返回空响应");
            }
            return response.getSteps().stream()
                    .map(this::toModel)
                    .toList();
        } catch (HttpStatusCodeException error) {
            throw mapHttpError(error);
        } catch (ResourceAccessException error) {
            throw new AgentRuntimeException("无法连接 Python Agent", error);
        } catch (RestClientException error) {
            throw new AgentRuntimeException("Python Agent 调用失败", error);
        }
    }

    private AgentPlanStep toModel(AgentPlanStepResponse response) {
        return new AgentPlanStep(
                response.getStepId(),
                response.getTitle(),
                response.getDescription(),
                response.isRequiresApproval()
        );
    }

    private AgentRuntimeException mapHttpError(
            HttpStatusCodeException error
    ) {
        // 只按状态码输出稳定本地信息，避免响应正文意外携带令牌或内部堆栈。
        if (error.getStatusCode() == HttpStatus.UNAUTHORIZED) {
            return new AgentRuntimeException("Python Agent 认证失败", error);
        }
        if (error.getStatusCode() == HttpStatus.PRECONDITION_FAILED) {
            return new AgentRuntimeException(
                    "Python Agent 协议版本不兼容",
                    error
            );
        }
        if (error.getStatusCode().is5xxServerError()) {
            return new AgentRuntimeException("Python Agent 服务异常", error);
        }
        return new AgentRuntimeException("Python Agent 请求被拒绝", error);
    }
}
