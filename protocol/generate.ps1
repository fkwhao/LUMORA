$ErrorActionPreference = 'Stop'

$buf = Get-Command buf -ErrorAction SilentlyContinue
if (-not $buf) {
    throw 'Buf CLI is required. Configure it in the IDE or add it to PATH.'
}

Push-Location $PSScriptRoot
try {
    & $buf.Source lint
    if ($LASTEXITCODE -ne 0) {
        throw 'Protocol lint failed.'
    }

    & $buf.Source generate
    if ($LASTEXITCODE -ne 0) {
        throw 'Protocol generation failed.'
    }
}
finally {
    Pop-Location
}

