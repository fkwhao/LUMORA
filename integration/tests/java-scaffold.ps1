$ErrorActionPreference = 'Stop'

$repositoryRoot = [System.IO.Path]::GetFullPath(
    (Join-Path $PSScriptRoot '..\..')
)
$requiredFiles = @(
    'core/pom.xml',
    'core/src/main/java/com/lumora/core/CoreApplication.java',
    'core/src/main/java/com/lumora/core/controller/TaskController.java',
    'core/src/main/java/com/lumora/core/service/TaskService.java',
    'core/src/main/java/com/lumora/core/service/impl/TaskServiceImpl.java',
    'core/src/main/java/com/lumora/core/mapper/TaskMapper.java',
    'core/src/main/java/com/lumora/core/entity/AgentTask.java',
    'core/src/main/resources/db/migration/V1__initial_schema.sql',
    'core/src/test/java/com/lumora/core/service/TaskServiceTest.java'
)

foreach ($relativePath in $requiredFiles) {
    $path = Join-Path $repositoryRoot $relativePath
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Missing Java scaffold file: $relativePath"
    }
}

$agentTask = Get-Content -Raw -Encoding UTF8 (
    Join-Path $repositoryRoot `
        'core/src/main/java/com/lumora/core/entity/AgentTask.java'
)
if (
    $agentTask -notmatch 'public\s+class\s+AgentTask' -or
    $agentTask -match 'record\s+AgentTask'
) {
    throw 'AgentTask must be a regular Java class.'
}

$pom = Get-Content -Raw -LiteralPath (Join-Path $repositoryRoot 'core/pom.xml')
foreach ($requiredText in @(
    '<java.version>21</java.version>',
    'mybatis-spring-boot-starter',
    'sqlite-jdbc',
    'grpc-netty-shaded',
    'protobuf-maven-plugin'
)) {
    if ($pom -notmatch [regex]::Escape($requiredText)) {
        throw "Java build is missing: $requiredText"
    }
}
