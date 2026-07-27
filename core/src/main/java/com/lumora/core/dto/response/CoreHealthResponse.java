package com.lumora.core.dto.response;

public class CoreHealthResponse {

    private final String serviceName;
    private final String serviceVersion;
    private final String protocolVersion;

    public CoreHealthResponse(
            String serviceName,
            String serviceVersion,
            String protocolVersion
    ) {
        this.serviceName = serviceName;
        this.serviceVersion = serviceVersion;
        this.protocolVersion = protocolVersion;
    }

    public String getServiceName() {
        return serviceName;
    }

    public String getServiceVersion() {
        return serviceVersion;
    }

    public String getProtocolVersion() {
        return protocolVersion;
    }
}
