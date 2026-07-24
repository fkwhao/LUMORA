package com.lumora.core.grpc.client;

import com.lumora.core.config.CoreProperties;
import com.lumora.protocol.v1.AgentServiceGrpc;
import com.lumora.protocol.v1.PlanTaskRequest;
import com.lumora.protocol.v1.PlanTaskResponse;
import com.lumora.protocol.v1.RequestContext;
import io.grpc.ManagedChannel;
import io.grpc.ManagedChannelBuilder;
import jakarta.annotation.PreDestroy;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.concurrent.TimeUnit;

@Component
public class GrpcAgentRuntimeClient implements AgentRuntimeClient {

    private static final long DEADLINE_SECONDS = 30L;

    private final CoreProperties properties;
    private ManagedChannel channel;

    public GrpcAgentRuntimeClient(CoreProperties properties) {
        this.properties = properties;
    }

    @Override
    public List<AgentPlanStep> planTask(
            String taskId,
            String goal,
            String correlationId
    ) {
        RequestContext context = RequestContext.newBuilder()
                .setProtocolVersion(properties.getProtocolVersion())
                .setStartupToken(properties.getAgentStartupToken())
                .setCorrelationId(correlationId)
                .build();
        PlanTaskRequest request = PlanTaskRequest.newBuilder()
                .setContext(context)
                .setTaskId(taskId)
                .setGoal(goal)
                .build();

        PlanTaskResponse response = AgentServiceGrpc
                .newBlockingStub(channel())
                .withDeadlineAfter(DEADLINE_SECONDS, TimeUnit.SECONDS)
                .planTask(request);
        return response.getStepsList().stream()
                .map(step -> new AgentPlanStep(
                        step.getStepId(),
                        step.getTitle(),
                        step.getDescription(),
                        step.getRequiresApproval()
                ))
                .toList();
    }

    private synchronized ManagedChannel channel() {
        if (properties.getAgentPort() <= 0) {
            throw new IllegalStateException("Python Agent 端口尚未配置");
        }
        if (channel == null || channel.isShutdown()) {
            // Python 只监听 loopback，禁止配置任意远程 Agent 地址。
            channel = ManagedChannelBuilder
                    .forAddress("127.0.0.1", properties.getAgentPort())
                    .usePlaintext()
                    .build();
        }
        return channel;
    }

    @PreDestroy
    public void close() throws InterruptedException {
        if (channel == null) {
            return;
        }
        channel.shutdown();
        if (!channel.awaitTermination(5, TimeUnit.SECONDS)) {
            channel.shutdownNow();
        }
    }
}
