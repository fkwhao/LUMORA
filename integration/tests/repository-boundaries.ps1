$ErrorActionPreference = 'Stop'

$repositoryRoot = [System.IO.Path]::GetFullPath(
    (Join-Path $PSScriptRoot '..\..')
)
$projectRoots = @('desktop', 'core', 'agent', 'protocol', 'integration')

foreach ($projectRoot in $projectRoots) {
    $projectPath = Join-Path $repositoryRoot $projectRoot
    if (-not (Test-Path -LiteralPath $projectPath -PathType Container)) {
        throw "Missing independent project root: $projectRoot"
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
