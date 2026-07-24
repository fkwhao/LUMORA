package com.lumora.core.config;

import com.lumora.core.common.TaskIdGenerator;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

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
}
