param(
    [string]$PythonCommand = 'python',
    [switch]$IncludeJava,
    [switch]$IncludePackage
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))

function Invoke-ProjectCheck {
    param(
        [string]$Name,
        [scriptblock]$Action
    )

    Write-Host "[$Name] running..." -ForegroundColor Cyan
    & $Action
    if ($LASTEXITCODE -ne 0) {
        throw "$Name failed with exit code $LASTEXITCODE."
    }
    Write-Host "[$Name] PASS" -ForegroundColor Green
}

Push-Location $repositoryRoot
try {
    Invoke-ProjectCheck 'Repository boundaries' {
        powershell -ExecutionPolicy Bypass -File integration/tests/repository-boundaries.ps1
    }
    Invoke-ProjectCheck 'Protocol structure' {
        powershell -ExecutionPolicy Bypass -File protocol/tests/contract-shape.ps1
    }
    Invoke-ProjectCheck 'Java scaffold' {
        powershell -ExecutionPolicy Bypass -File integration/tests/java-scaffold.ps1
    }

    $pythonExecutable = (Get-Command $PythonCommand -ErrorAction Stop).Source
    $env:PYTHONPATH = (Resolve-Path 'agent/src').Path
    Invoke-ProjectCheck 'Python core tests' {
        & $pythonExecutable -m unittest discover -s agent/tests -v
    }

    Push-Location 'desktop'
    try {
        Invoke-ProjectCheck 'Desktop tests' { pnpm test }
        Invoke-ProjectCheck 'Desktop typecheck' { pnpm typecheck }
        if ($IncludePackage) {
            # Electron Forge 在受限沙箱内可能需要项目目录写权限。
            Invoke-ProjectCheck 'Desktop package' { pnpm package }
        }
    }
    finally {
        Pop-Location
    }

    if ($IncludeJava) {
        Push-Location 'core'
        try {
            Invoke-ProjectCheck 'Java tests' { mvn test }
        }
        finally {
            Pop-Location
        }
    }
    else {
        Write-Host '[Java tests] SKIPPED: pass -IncludeJava after configuring JDK 21 and Maven.' -ForegroundColor Yellow
    }
}
finally {
    Pop-Location
}

