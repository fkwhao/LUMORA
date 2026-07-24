package com.lumora.core.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "lumora")
public class CoreProperties {

    private String protocolVersion = "1";
    private String startupToken = "";
    private int agentPort;
    private String agentStartupToken = "";

    public String getProtocolVersion() {
        return protocolVersion;
    }

    public void setProtocolVersion(String protocolVersion) {
        this.protocolVersion = protocolVersion;
    }

    public String getStartupToken() {
        return startupToken;
    }

    public void setStartupToken(String startupToken) {
        this.startupToken = startupToken;
    }

    public int getAgentPort() {
        return agentPort;
    }

    public void setAgentPort(int agentPort) {
        this.agentPort = agentPort;
    }

    public String getAgentStartupToken() {
        return agentStartupToken;
    }

    public void setAgentStartupToken(String agentStartupToken) {
        this.agentStartupToken = agentStartupToken;
    }
}
