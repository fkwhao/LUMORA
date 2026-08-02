package com.lumora.core.common.constant;

/**
 * 默认模型配置和系统凭据使用稳定标识，避免业务代码散落字符串常量。
 */
public final class ModelConfigurationConstants {

    public static final String DEFAULT_CONFIGURATION_ID = "default";
    public static final int MAX_API_KEY_LENGTH = 2048;

    private ModelConfigurationConstants() {
    }
}
