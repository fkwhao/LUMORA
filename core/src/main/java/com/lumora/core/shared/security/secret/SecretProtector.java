package com.lumora.core.shared.security.secret;

/**
 * 对本地敏感信息进行操作系统级保护。
 *
 * <p>业务层只依赖此接口，避免直接绑定具体平台的密钥保护实现。</p>
 */
public interface SecretProtector {

    /**
     * 将敏感明文转换为只适用于当前系统用户的受保护密文。
     *
     * @param plaintext 敏感明文
     * @return 可安全落库的编码密文
     */
    String protect(String plaintext);

    /**
     * 在需要使用敏感信息时恢复明文。
     *
     * @param ciphertext {@link #protect(String)} 生成的密文
     * @return 恢复后的明文；调用方不得记录日志或持久化
     */
    String unprotect(String ciphertext);
}
