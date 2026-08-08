package com.lumora.core.agent.client;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lumora.core.agent.client.http.AgentClientExceptionMapper;
import com.lumora.core.agent.client.http.AgentRuntimeHttpApi;
import com.lumora.core.agent.client.http.AgentRuntimeSseClient;
import com.lumora.core.agent.config.AgentClientConfiguration;
import com.lumora.core.agent.converter.AgentDtoMapper;
import com.lumora.core.agent.exception.AgentRuntimeException;
import com.lumora.core.agent.model.AgentPlanStep;
import com.lumora.core.shared.api.constant.HttpContractConstants;
import com.lumora.core.shared.config.CoreProperties;
import com.lumora.core.conversation.domain.model.ChatCompletion;
import com.lumora.core.conversation.domain.model.ChatMessage;
import com.lumora.core.agent.model.AgentMemoryCandidate;
import com.lumora.core.conversation.domain.model.ChatStreamEvent;
import com.lumora.core.conversation.domain.model.ChatStreamEventType;
import com.lumora.core.model.domain.model.ModelConnection;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.util.ArrayList;
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
    private static final ModelConnection CONNECTION = new ModelConnection(
            "OpenAI Compatible",
            "https://api.example.com/v1",
            "example-model",
            "provider-secret"
    );

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
                .baseUrl(properties.getAgentUrl())
                .defaultHeader(
                        HttpHeaders.AUTHORIZATION,
                        HttpContractConstants.BEARER_PREFIX + TOKEN
                )
                .defaultHeader(
                        HttpContractConstants.PROTOCOL_VERSION_HEADER,
                        properties.getProtocolVersion()
                );
        server = MockRestServiceServer.bindTo(builder).build();
        RestClient restClient = builder.build();
        AgentDtoMapper dtoMapper = new AgentDtoMapper();
        AgentClientExceptionMapper exceptionMapper =
                new AgentClientExceptionMapper();
        AgentRuntimeHttpApi httpApi = new AgentClientConfiguration()
                .agentRuntimeHttpApi(restClient);
        AgentRuntimeSseClient sseClient = new AgentRuntimeSseClient(
                restClient,
                new ObjectMapper(),
                dtoMapper,
                exceptionMapper
        );
        client = new HttpAgentRuntimeClient(
                httpApi,
                sseClient,
                dtoMapper,
                exceptionMapper
        );
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
                .andRespond(withStatus(
                        org.springframework.http.HttpStatus.UNAUTHORIZED
                ));

        AgentRuntimeException error = assertThrows(
                AgentRuntimeException.class,
                () -> client.planTask("task-123", "goal", "correlation-123")
        );

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

        assertThrows(
                AgentRuntimeException.class,
                () -> client.planTask("task-123", "goal", "correlation-123")
        );
    }

    @Test
    void mapsServerFailure() {
        server.expect(requestTo(
                        "http://127.0.0.1:45101/api/v1/tasks/plan"
                ))
                .andRespond(withStatus(
                        org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR
                ));

        assertThrows(
                AgentRuntimeException.class,
                () -> client.planTask("task-123", "goal", "correlation-123")
        );
    }

    @Test
    void mapsConnectionFailure() {
        server.expect(requestTo(
                        "http://127.0.0.1:45101/api/v1/tasks/plan"
                ))
                .andRespond(withException(new IOException("connection failed")));

        assertThrows(
                AgentRuntimeException.class,
                () -> client.planTask("task-123", "goal", "correlation-123")
        );
    }

    @Test
    void rejectsNonLoopbackAgentUrlBeforeRequest() {
        properties.setAgentUrl("http://192.168.1.8:45101");

        assertThrows(
                IllegalArgumentException.class,
                () -> AgentClientConfiguration.validateAgentUri(
                        properties.getAgentUrl()
                )
        );
    }

    @Test
    void mapsChatCompletionAndForwardsTransientConnection() {
        server.expect(requestTo(
                        "http://127.0.0.1:45101/api/v1/chat/completions"
                ))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().json("""
                        {
                          "messages": [
                            {"role": "user", "content": "你好"}
                          ],
                          "connection": {
                            "providerName": "OpenAI Compatible",
                            "baseUrl": "https://api.example.com/v1",
                            "model": "example-model",
                            "apiKey": "provider-secret"
                          }
                        }
                        """))
                .andRespond(withSuccess("""
                        {
                          "message": "你好，我是 LUMORA。",
                          "model": "example-model",
                          "usage": {
                            "promptTokens": 4,
                            "completionTokens": 6,
                            "totalTokens": 10
                          }
                        }
                        """, MediaType.APPLICATION_JSON));

        ChatCompletion completion = client.completeChat(
                List.of(new ChatMessage("user", "你好")),
                CONNECTION,
                "correlation-123"
        );

        assertEquals("你好，我是 LUMORA。", completion.getMessage());
        assertEquals(10, completion.getUsage().getTotalTokens());
        server.verify();
    }

    @Test
    void listsAvailableProviderModels() {
        server.expect(requestTo(
                        "http://127.0.0.1:45101/api/v1/models"
                ))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().json("""
                        {
                          "providerName": "DeepSeek",
                          "baseUrl": "https://api.deepseek.com",
                          "apiKey": "provider-secret"
                        }
                        """))
                .andRespond(withSuccess("""
                        {
                          "models": [
                            "deepseek-v4-flash",
                            "deepseek-v4-pro"
                          ]
                        }
                        """, MediaType.APPLICATION_JSON));

        List<String> models = client.listModels(
                "DeepSeek",
                "https://api.deepseek.com",
                "provider-secret",
                "correlation-123"
        );

        assertEquals(
                List.of("deepseek-v4-flash", "deepseek-v4-pro"),
                models
        );
        server.verify();
    }

    @Test
    void extractsStructuredMemoryCandidates() {
        server.expect(requestTo(
                        "http://127.0.0.1:45101/api/v1/memory/extractions"
                ))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().json("""
                        {
                          "userMessage": "以后回答简洁一点",
                          "assistantMessage": "好的",
                          "existingMemorySummary": null,
                          "workspacePath": "F:/project/test",
                          "connection": {
                            "apiKey": "provider-secret"
                          }
                        }
                        """, false))
                .andRespond(withSuccess("""
                        {
                          "candidates": [{
                            "scope": "USER",
                            "type": "PREFERENCE",
                            "retention": "LONG_TERM",
                            "content": "用户偏好简洁回答",
                            "dedupeKey": "user.response.style",
                            "subject": "用户",
                            "predicate": "response_style",
                            "value": "简洁",
                            "structuredData": {"style": "concise"},
                            "confidence": 0.95,
                            "ttlSeconds": null
                          }]
                        }
                        """, MediaType.APPLICATION_JSON));

        List<AgentMemoryCandidate> candidates = client.extractMemories(
                "以后回答简洁一点",
                "好的",
                null,
                "F:/project/test",
                CONNECTION,
                "correlation-123"
        );

        assertEquals(1, candidates.size());
        assertEquals("PREFERENCE", candidates.get(0).getType());
        assertEquals("user.response.style", candidates.get(0).getDedupeKey());
        assertEquals("UPSERT", candidates.get(0).getAction());
        assertEquals("MEMORY", candidates.get(0).getStorage());
        assertEquals("concise", candidates.get(0)
                .getStructuredData().get("style"));
        server.verify();
    }

    @Test
    void forwardsTextUsageAndCompletionStreamEvents() {
        server.expect(requestTo(
                        "http://127.0.0.1:45101/api/v1/chat/completions/stream"
                ))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().json("""
                        {
                          "reasoningEffort": "high",
                          "promptContext": {
                            "memorySummary": "- [偏好] 用户偏好简洁回答"
                          },
                          "connection": {
                            "apiKey": "provider-secret"
                          }
                        }
                        """, false))
                .andRespond(withSuccess("""
                        data: {"type":"text_delta","delta":"你","model":"demo"}

                        data: {"type":"reasoning_delta","delta":"分析问题","model":"demo"}

                        data: {"type":"text_delta","delta":"好","model":"demo"}

                        data: {"type":"usage","model":"demo","usage":{"promptTokens":2,"completionTokens":2,"totalTokens":4}}

                        data: {"type":"completed","model":"demo"}

                        """, MediaType.TEXT_EVENT_STREAM));
        List<ChatStreamEvent> events = new ArrayList<>();

        client.streamChat(
                List.of(new ChatMessage("user", "你好")),
                CONNECTION,
                "correlation-123",
                "high",
                "- [偏好] 用户偏好简洁回答",
                events::add
        );

        assertEquals(5, events.size());
        assertEquals(ChatStreamEventType.TEXT_DELTA, events.get(0).getType());
        assertEquals(
                ChatStreamEventType.REASONING_DELTA,
                events.get(1).getType()
        );
        assertEquals(
                "你好",
                events.get(0).getDelta() + events.get(2).getDelta()
        );
        assertEquals(4, events.get(3).getUsage().getTotalTokens());
        assertEquals(
                ChatStreamEventType.COMPLETED,
                events.get(4).getType()
        );
        server.verify();
    }

    @Test
    void forwardsPermissionModeAndMapsToolApprovalEvents() {
        server.expect(requestTo(
                        "http://127.0.0.1:45101/api/v1/chat/completions/stream"
                ))
                .andExpect(content().json("""
                        {
                          "promptContext": {
                            "workspacePath": "F:/project/demo",
                            "permissionMode": "request_approval"
                          }
                        }
                        """, false))
                .andRespond(withSuccess("""
                        data: {"type":"tool_approval_requested","itemId":"item-1","toolCallId":"call-1","toolName":"shell_command","title":"git status","arguments":{"command":"git status"},"approvalId":"approval-1","permissionLayer":"mode","reason":"需要确认","riskLevel":"MEDIUM","reversible":true}

                        data: {"type":"tool_approval_resolved","itemId":"item-1","toolCallId":"call-1","toolName":"shell_command","approvalId":"approval-1","decision":"allow"}

                        data: {"type":"completed","model":"demo"}

                        """, MediaType.TEXT_EVENT_STREAM));
        List<ChatStreamEvent> events = new ArrayList<>();

        client.streamChat(
                List.of(new ChatMessage("user", "检查仓库")),
                CONNECTION,
                "correlation-123",
                null,
                null,
                "F:/project/demo",
                "request_approval",
                events::add
        );

        assertEquals(
                ChatStreamEventType.TOOL_APPROVAL_REQUESTED,
                events.getFirst().getType()
        );
        assertEquals("approval-1", events.getFirst().getApprovalId());
        assertEquals("mode", events.getFirst().getPermissionLayer());
        assertEquals(Boolean.TRUE, events.getFirst().getReversible());
        assertEquals(
                ChatStreamEventType.TOOL_APPROVAL_RESOLVED,
                events.get(1).getType()
        );
        assertEquals("allow", events.get(1).getDecision());
        server.verify();
    }

    @Test
    void forwardsToolApprovalWithOriginalCorrelationId() {
        server.expect(requestTo(
                        "http://127.0.0.1:45101/api/v1/tool-approvals/approval-1"
                ))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Correlation-Id", "correlation-123"))
                .andExpect(content().json("""
                        {"decision":"allow_always"}
                        """))
                .andRespond(withSuccess());

        client.decideToolApproval(
                "approval-1",
                "allow_always",
                "correlation-123"
        );

        server.verify();
    }
}
