package com.lumora.core.memory.api.controller;

import com.lumora.core.memory.api.controller.MemoryController;
import com.lumora.core.shared.api.advice.RestExceptionHandler;
import com.lumora.core.memory.domain.model.MemorySettings;
import com.lumora.core.memory.application.service.MemoryService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class MemoryControllerTest {

    private MemoryService service;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        service = mock(MemoryService.class);
        mockMvc = standaloneSetup(new MemoryController(service))
                .setControllerAdvice(new RestExceptionHandler())
                .build();
    }

    @Test
    void readsAndUpdatesTheMasterMemorySwitch() throws Exception {
        when(service.getSettings()).thenReturn(new MemorySettings(true));
        when(service.updateSettings(false))
                .thenReturn(new MemorySettings(false));

        mockMvc.perform(get("/api/v1/memory/settings")
                        .header("X-Correlation-Id", "test-get"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(true));

        mockMvc.perform(put("/api/v1/memory/settings")
                        .header("X-Correlation-Id", "test-put")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"enabled\":false}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(false));

        verify(service).updateSettings(false);
    }

    @Test
    void rejectsASettingsRequestWithoutTheRequiredBoolean() throws Exception {
        mockMvc.perform(put("/api/v1/memory/settings")
                        .header("X-Correlation-Id", "test-invalid")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void resetsAllDynamicMemories() throws Exception {
        when(service.reset()).thenReturn(3);

        mockMvc.perform(delete("/api/v1/memory")
                        .header("X-Correlation-Id", "test-reset"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.deletedCount").value(3));

        verify(service).reset();
    }
}
