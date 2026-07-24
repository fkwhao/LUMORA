$ErrorActionPreference = 'Stop'

$repositoryRoot = [System.IO.Path]::GetFullPath(
    (Join-Path $PSScriptRoot '..\..')
)
$requiredFiles = @(
    'agent/requirements.txt',
    'agent/requirements-dev.txt',
    'agent/app/main.py',
    'agent/app/controller/grpc/agent_servicer.py',
    'agent/app/service/planner_service.py',
    'agent/app/model/plan_step.py',
    'agent/app/config/settings.py'
)

foreach ($relativePath in $requiredFiles) {
    $path = Join-Path $repositoryRoot $relativePath
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Missing layered Python file: $relativePath"
    }
}

if (Test-Path -LiteralPath (Join-Path $repositoryRoot 'agent/pyproject.toml')) {
    throw 'Python dependencies must be managed by requirements files.'
}
