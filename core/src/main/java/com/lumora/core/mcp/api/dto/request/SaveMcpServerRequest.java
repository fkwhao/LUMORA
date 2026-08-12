package com.lumora.core.mcp.api.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class SaveMcpServerRequest {
    @NotBlank
    @Size(max = 120)
    private String name;
    private boolean enabled = true;
    @NotBlank
    @Size(max = 2000)
    private String url;
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
    public String getUrl() { return url; }
    public void setUrl(String url) { this.url = url; }
    public String getAuthType() { return authType; }
    public void setAuthType(String authType) { this.authType = authType; }
    public String getHeaderName() { return headerName; }
    public void setHeaderName(String headerName) { this.headerName = headerName; }
    public String getCredential() { return credential; }
    public void setCredential(String credential) { this.credential = credential; }
}
