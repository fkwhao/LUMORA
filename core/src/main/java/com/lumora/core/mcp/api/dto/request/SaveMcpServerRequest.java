package com.lumora.core.mcp.api.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.Map;

public class SaveMcpServerRequest {
    @NotBlank
    @Size(max = 120)
    private String name;
    private boolean enabled = true;
    @Size(max = 40)
    private String transportType = "streamable_http";
    @Size(max = 2000)
    private String url;
    @Size(max = 1000)
    private String command;
    @Size(max = 64)
    private List<String> arguments;
    @Size(max = 2000)
    private String workingDirectory;
    @Size(max = 64)
    private Map<String, String> environment;
    private boolean clearEnvironment;
    @Size(max = 40)
    private String authType = "none";
    @Size(max = 100)
    private String headerName;
    @Size(max = 4096)
    private String credential;

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public String getTransportType() { return transportType; }
    public void setTransportType(String transportType) {
        this.transportType = transportType;
    }
    public String getUrl() { return url; }
    public void setUrl(String url) { this.url = url; }
    public String getCommand() { return command; }
    public void setCommand(String command) { this.command = command; }
    public List<String> getArguments() { return arguments; }
    public void setArguments(List<String> arguments) { this.arguments = arguments; }
    public String getWorkingDirectory() { return workingDirectory; }
    public void setWorkingDirectory(String workingDirectory) {
        this.workingDirectory = workingDirectory;
    }
    public Map<String, String> getEnvironment() { return environment; }
    public void setEnvironment(Map<String, String> environment) {
        this.environment = environment;
    }
    public boolean isClearEnvironment() { return clearEnvironment; }
    public void setClearEnvironment(boolean clearEnvironment) {
        this.clearEnvironment = clearEnvironment;
    }
    public String getAuthType() { return authType; }
    public void setAuthType(String authType) { this.authType = authType; }
    public String getHeaderName() { return headerName; }
    public void setHeaderName(String headerName) { this.headerName = headerName; }
    public String getCredential() { return credential; }
    public void setCredential(String credential) { this.credential = credential; }
}
