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

function Invoke-BatchFile {
    param(
        [string]$Path,
        [string[]]$BatchArguments
    )

    $commandLine = '"' + $Path + '" ' + ($BatchArguments -join ' ')
    & $env:ComSpec /d /c $commandLine
}

Push-Location $repositoryRoot
try {
    Invoke-ProjectCheck 'Repository boundaries' {
        powershell -ExecutionPolicy Bypass `
            -File integration/tests/repository-boundaries.ps1
    }

    $pythonExecutable = if (
        Test-Path -LiteralPath $PythonCommand -PathType Leaf
    ) {
        (Resolve-Path -LiteralPath $PythonCommand).Path
    }
    else {
        (Get-Command $PythonCommand -ErrorAction Stop).Source
    }
    $env:PYTHONPATH = (Resolve-Path 'agent').Path
    Invoke-ProjectCheck 'Python tests' {
        & $pythonExecutable -m unittest discover -s agent/tests -v
    }
    Invoke-ProjectCheck 'Python Ruff' {
        & $pythonExecutable -m ruff check agent/app agent/tests
    }
    Invoke-ProjectCheck 'Python MyPy' {
        & $pythonExecutable -m mypy agent/app
    }

    $pnpmExecutable = (Get-Command 'pnpm.cmd' -ErrorAction Stop).Source
    # 独立 cmd 进程可防止 pnpm shim 的 exit 结束当前验证脚本。
    Invoke-ProjectCheck 'Desktop tests' {
        Invoke-BatchFile `
            -Path $pnpmExecutable `
            -BatchArguments @('--dir', 'desktop', 'test')
    }
    Invoke-ProjectCheck 'Desktop typecheck' {
        Invoke-BatchFile `
            -Path $pnpmExecutable `
            -BatchArguments @('--dir', 'desktop', 'typecheck')
    }
    if ($IncludePackage) {
        Invoke-ProjectCheck 'Desktop package' {
            Invoke-BatchFile `
                -Path $pnpmExecutable `
                -BatchArguments @('--dir', 'desktop', 'package')
        }
    }

    if ($IncludeJava) {
        $mavenWrapper = (Resolve-Path 'core/mvnw.cmd').Path
        # Java 验证固定走 Wrapper，避免依赖开发机的全局 Maven 版本。
        Invoke-ProjectCheck 'Java tests' {
            Invoke-BatchFile `
                -Path $mavenWrapper `
                -BatchArguments @('-f', 'core/pom.xml', 'test')
        }
    }
    else {
        Write-Host (
            '[Java tests] SKIPPED: pass -IncludeJava after configuring JDK 21.'
        ) -ForegroundColor Yellow
    }
}
finally {
    Pop-Location
}
