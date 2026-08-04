package com.lumora.core.agent.client.http;

import com.lumora.core.agent.exception.AgentRuntimeException;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientException;

import java.util.function.Supplier;

/**
 * 将 Spring HTTP 异常转换成稳定的 Agent 领域异常。
 */
@Component
public class AgentClientExceptionMapper {

    public void executeVoid(Runnable request) {
        try {
            request.run();
        } catch (AgentRuntimeException error) {
            throw error;
        } catch (RestClientException error) {
            throw map(error);
        }
    }

    public <T> T execute(Supplier<T> request) {
        try {
            T response = request.get();
            if (response == null) {
                throw new AgentRuntimeException("Python Agent 返回空响应");
            }
            return response;
        } catch (AgentRuntimeException error) {
            throw error;
        } catch (RestClientException error) {
            throw map(error);
        }
    }

    public AgentRuntimeException map(RestClientException error) {
        if (error instanceof HttpStatusCodeException statusError) {
            return fromStatus(statusError.getStatusCode(), statusError);
        }
        if (error instanceof ResourceAccessException) {
            return new AgentRuntimeException(
                    "无法连接 Python Agent",
                    error
            );
        }
        return new AgentRuntimeException("Python Agent 调用失败", error);
    }

    public AgentRuntimeException fromStatus(HttpStatusCode statusCode) {
        return fromStatus(statusCode, null);
    }

    private AgentRuntimeException fromStatus(
            HttpStatusCode statusCode,
            Throwable cause
    ) {
        String message;
        if (statusCode == HttpStatus.UNAUTHORIZED) {
            message = "Python Agent 认证失败";
        } else if (statusCode == HttpStatus.PRECONDITION_FAILED) {
            message = "Python Agent 协议版本不兼容";
        } else if (statusCode == HttpStatus.CONFLICT) {
            message = "请先在设置中配置模型 API";
        } else if (statusCode == HttpStatus.BAD_GATEWAY) {
            message = "模型 API 调用失败，请检查地址、Key 和模型名";
        } else if (statusCode.is5xxServerError()) {
            message = "Python Agent 服务异常";
        } else {
            message = "Python Agent 请求被拒绝";
        }
        return cause == null
                ? new AgentRuntimeException(message)
                : new AgentRuntimeException(message, cause);
    }
}
