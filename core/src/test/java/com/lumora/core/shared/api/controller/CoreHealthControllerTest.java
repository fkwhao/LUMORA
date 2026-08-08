package com.lumora.core.shared.api.controller;

import com.lumora.core.shared.api.controller.CoreHealthController;
import com.lumora.core.shared.config.CoreProperties;
import com.lumora.core.shared.security.filter.SessionTokenFilter;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class CoreHealthControllerTest {

    private static final String STARTUP_TOKEN = "test-startup-token";

    @Test
    void rejectsHealthRequestWithoutStartupToken() throws Exception {
        MockMvc mockMvc = mockMvc();

        mockMvc.perform(get("/api/v1/health"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void returnsVersionContractForAuthenticatedRequest() throws Exception {
        MockMvc mockMvc = mockMvc();

        mockMvc.perform(get("/api/v1/health")
                        .header(
                                HttpHeaders.AUTHORIZATION,
                                "Bearer " + STARTUP_TOKEN
                        ))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.serviceName")
                        .value("lumora-core"))
                .andExpect(jsonPath("$.serviceVersion").value("0.1.0"))
                .andExpect(jsonPath("$.protocolVersion").value("1"));
    }

    private static MockMvc mockMvc() {
        CoreProperties properties = new CoreProperties();
        properties.setStartupToken(STARTUP_TOKEN);
        properties.setProtocolVersion("1");
        return standaloneSetup(new CoreHealthController(properties))
                .addFilters(new SessionTokenFilter(properties))
                .build();
    }
}
