package com.lumora.core.security.secret;

import com.sun.jna.Platform;
import com.sun.jna.platform.win32.Crypt32Util;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Base64;

/**
 * 使用 Windows DPAPI 保护 API Key。
 *
 * <p>密文只能由加密它的 Windows 用户解密。SQLite 中只保存 Base64
 * 编码后的 DPAPI 密文，不保存应用自定义主密钥。</p>
 */
public class WindowsDpapiSecretProtector implements SecretProtector {

    @Override
    public String protect(String plaintext) {
        requireWindows();
        if (plaintext == null || plaintext.isBlank()) {
            throw new IllegalArgumentException("待保护的敏感信息不能为空");
        }
        byte[] source = plaintext.getBytes(StandardCharsets.UTF_8);
        byte[] protectedBytes = null;
        try {
            protectedBytes = Crypt32Util.cryptProtectData(source);
            return Base64.getEncoder().encodeToString(protectedBytes);
        } catch (RuntimeException error) {
            throw new SecretProtectionException(
                    "Windows DPAPI 加密失败",
                    error
            );
        } finally {
            Arrays.fill(source, (byte) 0);
            if (protectedBytes != null) {
                Arrays.fill(protectedBytes, (byte) 0);
            }
        }
    }

    @Override
    public String unprotect(String ciphertext) {
        requireWindows();
        if (ciphertext == null || ciphertext.isBlank()) {
            throw new SecretProtectionException("模型 API Key 尚未配置");
        }
        byte[] protectedBytes;
        try {
            protectedBytes = Base64.getDecoder().decode(ciphertext);
        } catch (IllegalArgumentException error) {
            throw new SecretProtectionException("API Key 密文格式无效", error);
        }

        byte[] plaintext = null;
        try {
            plaintext = Crypt32Util.cryptUnprotectData(protectedBytes);
            return new String(plaintext, StandardCharsets.UTF_8);
        } catch (RuntimeException error) {
            throw new SecretProtectionException(
                    "Windows DPAPI 解密失败，请重新配置 API Key",
                    error
            );
        } finally {
            Arrays.fill(protectedBytes, (byte) 0);
            if (plaintext != null) {
                Arrays.fill(plaintext, (byte) 0);
            }
        }
    }

    private void requireWindows() {
        if (!Platform.isWindows()) {
            throw new SecretProtectionException(
                    "当前系统不支持 Windows DPAPI"
            );
        }
    }
}
