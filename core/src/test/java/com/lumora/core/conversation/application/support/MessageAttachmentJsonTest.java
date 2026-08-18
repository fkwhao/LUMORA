package com.lumora.core.conversation.application.support;

import com.lumora.core.conversation.domain.model.MessageAttachment;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class MessageAttachmentJsonTest {

    @Test
    void storesOnlyMetadataReference() {
        MessageAttachment attachment = new MessageAttachment(
                "attachment-1",
                "数据库同步问题总结.md",
                "text/markdown",
                4280,
                "F:\\Workspace\\数据库同步问题总结.md",
                MessageAttachment.Kind.FILE,
                MessageAttachment.Source.LOCAL_FILE
        );

        String json = MessageAttachmentJson.encode(List.of(attachment));

        assertThat(json).contains("数据库同步问题总结.md")
                .contains("F:\\\\Workspace")
                .doesNotContain("base64");
        assertThat(MessageAttachmentJson.decode(json)).containsExactly(attachment);
    }
}
