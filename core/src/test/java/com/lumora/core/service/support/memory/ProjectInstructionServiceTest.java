package com.lumora.core.service.support.memory;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class ProjectInstructionServiceTest {

    @TempDir
    private Path workspace;

    private final ProjectInstructionService service =
            new ProjectInstructionService();

    @Test
    void createsAndUpdatesManagedProjectInstructions() throws Exception {
        assertThat(service.apply(
                workspace.toString(), "UPSERT",
                "project.language.constraint", "项目统一使用 Java"
        )).isTrue();
        assertThat(service.apply(
                workspace.toString(), "UPSERT",
                "project.language.constraint", "项目统一使用 Kotlin"
        )).isTrue();

        String content = readInstructions();
        assertThat(content)
                .contains(ProjectInstructionService.START_MARKER)
                .contains("[project.language.constraint] 项目统一使用 Kotlin")
                .doesNotContain("项目统一使用 Java");
    }

    @Test
    void archivesBySemanticKeyAndPreservesUserContent() throws Exception {
        Path directory = workspace.resolve(".lumora");
        Files.createDirectories(directory);
        Files.writeString(directory.resolve("AGENTS.md"),
                "# User rules\n\nDo not edit this paragraph.\n",
                StandardCharsets.UTF_8);
        service.apply(workspace.toString(), "UPSERT",
                "project.language.constraint", "项目统一使用 Java");

        assertThat(service.apply(
                workspace.toString(), "ARCHIVE",
                "project.language.constraint", "项目统一使用 Java"
        )).isTrue();

        String content = readInstructions();
        assertThat(content).contains("Do not edit this paragraph.");
        assertThat(content).doesNotContain("project.language.constraint");
    }

    private String readInstructions() throws Exception {
        return Files.readString(
                workspace.resolve(".lumora").resolve("AGENTS.md"),
                StandardCharsets.UTF_8
        );
    }
}
