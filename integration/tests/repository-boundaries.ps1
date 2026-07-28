$ErrorActionPreference = 'Stop'

$repositoryRoot = [System.IO.Path]::GetFullPath(
    (Join-Path $PSScriptRoot '..\..')
)

$requiredDirectories = @('desktop', 'core', 'agent', 'contracts', 'integration')
foreach ($relativePath in $requiredDirectories) {
    $path = Join-Path $repositoryRoot $relativePath
    if (-not (Test-Path -LiteralPath $path -PathType Container)) {
        throw "Missing independent project root: $relativePath"
    }
}

$requiredFiles = @(
    'contracts/agent-api.yaml',
    'agent/app/controller/http/agent_controller.py',
    'agent/config/dev-local.example.yml',
    'core/src/main/java/com/lumora/core/agent/client/HttpAgentRuntimeClient.java',
    'core/src/main/resources/application-dev-local.example.yml',
    'desktop/config/dev-local.example.yml',
    'desktop/pnpm-workspace.yaml',
    'desktop/pnpm-lock.yaml'
)
foreach ($relativePath in $requiredFiles) {
    $path = Join-Path $repositoryRoot $relativePath
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Missing REST-only project file: $relativePath"
    }
}

$forbiddenPaths = @(
    'protocol',
    'package.json',
    'pnpm-workspace.yaml',
    'pnpm-lock.yaml',
    'integration/dev'
)
foreach ($relativePath in $forbiddenPaths) {
    if (Test-Path -LiteralPath (Join-Path $repositoryRoot $relativePath)) {
        throw "Obsolete protocol or launcher path still exists: $relativePath"
    }
}

if (Test-Path -LiteralPath (Join-Path $repositoryRoot 'integration/tests/dev')) {
    throw 'Obsolete launcher tests still exist: integration/tests/dev'
}

$trackedFiles = & git -C $repositoryRoot ls-files
foreach ($secretPath in @(
    'agent/config/dev-local.yml',
    'core/src/main/resources/application-dev-local.yml',
    'desktop/config/dev-local.yml'
)) {
    if ($trackedFiles -contains $secretPath) {
        throw "Real local secret config must not be tracked: $secretPath"
    }
}

$runtimeRoots = @(
    'desktop/src',
    'core/src',
    'agent/app'
) |
    ForEach-Object { Join-Path $repositoryRoot $_ } |
    Where-Object { Test-Path -LiteralPath $_ -PathType Container }

$forbiddenImports = Get-ChildItem -LiteralPath $runtimeRoots -Recurse -File |
    Where-Object {
        $_.Extension -in @('.ts', '.tsx', '.js', '.mjs', '.java', '.py')
    } |
    Select-String -Pattern '(from|import|require\()\s*["'']?\.\.[\\/](desktop|core|agent)'
if ($forbiddenImports) {
    $paths = $forbiddenImports.Path -join ', '
    throw "Cross-runtime source import detected: $paths"
}

$activeFiles = @(
    (Get-ChildItem -LiteralPath $runtimeRoots -Recurse -File),
    (Get-Item -LiteralPath (Join-Path $repositoryRoot 'agent/requirements.txt')),
    (Get-Item -LiteralPath (Join-Path $repositoryRoot 'agent/requirements-dev.txt')),
    (Get-Item -LiteralPath (Join-Path $repositoryRoot 'core/pom.xml')),
    (Get-Item -LiteralPath (Join-Path $repositoryRoot 'desktop/package.json')),
    (Get-Item -LiteralPath (Join-Path $repositoryRoot 'desktop/pnpm-lock.yaml'))
)
$obsoleteReferences = $activeFiles |
    Where-Object {
        $_.Extension -in @(
            '.ts', '.tsx', '.js', '.mjs', '.java', '.py',
            '.xml', '.json', '.yaml', '.yml', '.txt'
        )
    } |
    Select-String -Pattern '\b(grpc|protobuf|buf)\b|com\.lumora\.protocol'
if ($obsoleteReferences) {
    $locations = $obsoleteReferences |
        ForEach-Object { "$($_.Path):$($_.LineNumber)" }
    throw "Obsolete generated protocol reference detected: $($locations -join ', ')"
}
