package com.lumora.core.shared.config;

import com.lumora.core.task.domain.model.TaskIdGenerator;
import com.lumora.core.shared.security.secret.SecretProtector;
import com.lumora.core.shared.security.secret.WindowsDpapiSecretProtector;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Configuration
public class RuntimeBeansConfig {

    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }

    @Bean
    public TaskIdGenerator taskIdGenerator() {
        return new TaskIdGenerator();
    }

    @Bean
    public SecretProtector secretProtector() {
        return new WindowsDpapiSecretProtector();
    }

    @Bean(destroyMethod = "close")
    public ExecutorService conversationExecutor() {
        // 模型流是阻塞式 HTTP 读取，虚拟线程可避免长期占用平台线程。
        return Executors.newVirtualThreadPerTaskExecutor();
    }
}
