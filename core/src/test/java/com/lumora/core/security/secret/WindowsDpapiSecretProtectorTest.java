package com.lumora.core.security.secret;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledOnOs;
import org.junit.jupiter.api.condition.OS;

import static org.assertj.core.api.Assertions.assertThat;

@EnabledOnOs(OS.WINDOWS)
class WindowsDpapiSecretProtectorTest {

    private final SecretProtector protector =
            new WindowsDpapiSecretProtector();

    @Test
    void protectsAndRestoresSecretForCurrentWindowsUser() {
        String plaintext = "test-provider-key";

        String ciphertext = protector.protect(plaintext);

        assertThat(ciphertext).isNotBlank().doesNotContain(plaintext);
        assertThat(protector.unprotect(ciphertext)).isEqualTo(plaintext);
    }
}
