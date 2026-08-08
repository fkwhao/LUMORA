package com.lumora.core.shared.security.filter;

import com.lumora.core.shared.config.CoreProperties;
import com.lumora.core.shared.security.filter.SessionTokenFilter;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;

class SessionTokenFilterTest {

    @Test
    void rejectsAMissingToken() throws Exception {
        SessionTokenFilter filter = filter("expected-token");
        MockHttpServletRequest request =
                new MockHttpServletRequest("GET", "/api/v1/tasks/task-1");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getStatus())
                .isEqualTo(HttpServletResponse.SC_UNAUTHORIZED);
    }

    @Test
    void acceptsTheExactBearerToken() throws Exception {
        SessionTokenFilter filter = filter("expected-token");
        MockHttpServletRequest request =
                new MockHttpServletRequest("GET", "/api/v1/tasks/task-1");
        request.addHeader("Authorization", "Bearer expected-token");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getStatus())
                .isEqualTo(HttpServletResponse.SC_OK);
    }

    private static SessionTokenFilter filter(String token) {
        CoreProperties properties = new CoreProperties();
        properties.setStartupToken(token);
        return new SessionTokenFilter(properties);
    }
}
