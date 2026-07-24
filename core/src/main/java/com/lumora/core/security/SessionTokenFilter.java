package com.lumora.core.security;

import com.lumora.core.config.CoreProperties;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/**
 * Java REST 只接受 Electron Main 持有的本次启动令牌。
 */
@Component
public class SessionTokenFilter extends OncePerRequestFilter {

    private static final String BEARER_PREFIX = "Bearer ";

    private final CoreProperties properties;

    public SessionTokenFilter(CoreProperties properties) {
        this.properties = properties;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api/");
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        String authorization = request.getHeader(HttpHeaders.AUTHORIZATION);
        String suppliedToken = extractToken(authorization);
        if (!matches(properties.getStartupToken(), suppliedToken)) {
            response.sendError(
                    HttpServletResponse.SC_UNAUTHORIZED,
                    "启动令牌无效"
            );
            return;
        }
        filterChain.doFilter(request, response);
    }

    private String extractToken(String authorization) {
        if (
            authorization == null
                || !authorization.startsWith(BEARER_PREFIX)
        ) {
            return "";
        }
        return authorization.substring(BEARER_PREFIX.length());
    }

    private boolean matches(String expectedToken, String suppliedToken) {
        if (expectedToken == null || expectedToken.isBlank()) {
            return false;
        }
        return MessageDigest.isEqual(
                expectedToken.getBytes(StandardCharsets.UTF_8),
                suppliedToken.getBytes(StandardCharsets.UTF_8)
        );
    }
}
