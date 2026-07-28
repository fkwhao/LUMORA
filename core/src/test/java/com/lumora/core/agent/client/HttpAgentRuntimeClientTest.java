package com.lumora.core.agent.client;

import com.lumora.core.agent.exception.AgentRuntimeException;
import com.lumora.core.agent.model.AgentPlanStep;
import com.lumora.core.config.CoreProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class HttpAgentRuntimeClientTest {

    private static final String TOKEN = "a".repeat(64);

    private CoreProperties properties;
    private MockRestServiceServer server;
    private HttpAgentRuntimeClient client;

    @BeforeEach
    void setUp() {
        properties = new CoreProperties();
        properties.setAgentUrl("http://127.0.0.1:45101");
        properties.setAgentStartupToken(TOKEN);
        properties.setProtocolVersion("1");

        RestClient.Builder builder = RestClient.builder()
                .baseUrl(properties.getAgentUrl());
        server = MockRestServiceServer.bindTo(builder).build();
        client = new HttpAgentRuntimeClient(builder.build(), properties);
    }

    @Test
    void sendsExactRestContractAndMapsResponse() {
        server.expect(once(), requestTo(
                        "http://127.0.0.1:45101/api/v1/tasks/plan"
                ))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("Authorization", "Bearer " + TOKEN))
                .andExpect(header("X-Lumora-Protocol-Version", "1"))
                .andExpect(header("X-Correlation-Id", "correlation-123"))
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(content().json("""
                        {
                          "taskId": "task-123",
                          "goal": "整理本地文档"
                        }
                        """))
                .andRespond(withSuccess("""
                        {
                          "taskId": "task-123",
                          "steps": [
                            {
                              "stepId": "understand-goal",
                              "title": "理解目标",
                              "description": "分析任务目标",
                              "requiresApproval": false
                            }
                          ]
                        }
                        """, MediaType.APPLICATION_JSON));

        List<AgentPlanStep> steps = client.planTask(
                "task-123",
                "整理本地文档",
                "correlation-123"
        );

        assertEquals(1, steps.size());
        assertEquals("understand-goal", steps.getFirst().getStepId());
        assertFalse(steps.getFirst().isRequiresApproval());
        server.verify();
    }

    @Test
    void mapsAuthenticationFailureWithoutLeakingToken() {
        server.expect(requestTo(
                        "http://127.0.0.1:45101/api/v1/tasks/plan"
                ))
                .andRespond(withStatus(org.springframework.http.HttpStatus.UNAUTHORIZED));

        AgentRuntimeException error = assertThrows(
                AgentRuntimeException.class,
                () -> client.planTask("task-123", "goal", "correlation-123")
        );

        assertEquals("Python Agent 认证失败", error.getMessage());
        assertFalse(error.getMessage().contains(TOKEN));
    }

    @Test
    void mapsProtocolMismatch() {
        server.expect(requestTo(
                        "http://127.0.0.1:45101/api/v1/tasks/plan"
                ))
                .andRespond(withStatus(
                        org.springframework.http.HttpStatus.PRECONDITION_FAILED
                ));

        AgentRuntimeException error = assertThrows(
                AgentRuntimeException.class,
                () -> client.planTask("task-123", "goal", "correlation-123")
        );

        assertEquals("Python Agent 协议版本不兼容", error.getMessage());
    }

    @Test
    void mapsServerFailure() {
        server.expect(requestTo(
                        "http://127.0.0.1:45101/api/v1/tasks/plan"
                ))
                .andRespond(withStatus(
                        org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR
                ));

        AgentRuntimeException error = assertThrows(
                AgentRuntimeException.class,
                () -> client.planTask("task-123", "goal", "correlation-123")
        );

        assertEquals("Python Agent 服务异常", error.getMessage());
    }

    @Test
    void mapsConnectionFailure() {
        server.expect(requestTo(
                        "http://127.0.0.1:45101/api/v1/tasks/plan"
                ))
                .andRespond(withException(new IOException("connection failed")));

        AgentRuntimeException error = assertThrows(
                AgentRuntimeException.class,
                () -> client.planTask("task-123", "goal", "correlation-123")
        );

        assertEquals("无法连接 Python Agent", error.getMessage());
    }

    @Test
    void rejectsNonLoopbackAgentUrlBeforeRequest() {
        properties.setAgentUrl("http://192.168.1.8:45101");

        assertThrows(
                IllegalArgumentException.class,
                () -> new HttpAgentRuntimeClient(
                        RestClient.create(properties.getAgentUrl()),
                        properties
                )
        );
    }
}
