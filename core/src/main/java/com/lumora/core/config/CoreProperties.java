package com.lumora.core.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "lumora")
public class CoreProperties {

    private String protocolVersion = "1";
    private String startupToken = "";
    private String agentUrl = "http://127.0.0.1:45101";
    private String agentStartupToken = "";
    private boolean memoryAutoExtractionEnabled = true;

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

    public String getAgentUrl() {
        return agentUrl;
    }

    public void setAgentUrl(String agentUrl) {
        this.agentUrl = agentUrl;
    }

    public String getAgentStartupToken() {
        return agentStartupToken;
    }

    public void setAgentStartupToken(String agentStartupToken) {
        this.agentStartupToken = agentStartupToken;
    }

    public boolean isMemoryAutoExtractionEnabled() {
        return memoryAutoExtractionEnabled;
    }

    public void setMemoryAutoExtractionEnabled(
            boolean memoryAutoExtractionEnabled
    ) {
        this.memoryAutoExtractionEnabled = memoryAutoExtractionEnabled;
    }
}
