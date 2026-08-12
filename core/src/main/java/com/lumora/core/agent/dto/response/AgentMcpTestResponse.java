package com.lumora.core.agent.dto.response;

import java.util.List;

public class AgentMcpTestResponse {
    private boolean connected;
    private String serverName;
    private String serverVersion;
    private List<String> tools = List.of();
    private List<String> resources = List.of();
    private List<String> resourceTemplates = List.of();
    private List<String> prompts = List.of();
    private String echoOutput;

    public boolean isConnected() { return connected; }
    public void setConnected(boolean connected) { this.connected = connected; }
    public String getServerName() { return serverName; }
    public void setServerName(String serverName) { this.serverName = serverName; }
    public String getServerVersion() { return serverVersion; }
    public void setServerVersion(String serverVersion) { this.serverVersion = serverVersion; }
    public List<String> getTools() { return tools; }
    public void setTools(List<String> tools) { this.tools = safeCopy(tools); }
    public List<String> getResources() { return resources; }
    public void setResources(List<String> resources) { this.resources = safeCopy(resources); }
    public List<String> getResourceTemplates() { return resourceTemplates; }
    public void setResourceTemplates(List<String> resourceTemplates) { this.resourceTemplates = safeCopy(resourceTemplates); }
    public List<String> getPrompts() { return prompts; }
    public void setPrompts(List<String> prompts) { this.prompts = safeCopy(prompts); }
    public String getEchoOutput() { return echoOutput; }
    public void setEchoOutput(String echoOutput) { this.echoOutput = echoOutput; }

    private static List<String> safeCopy(List<String> values) {
        return values == null ? List.of() : List.copyOf(values);
    }
}
