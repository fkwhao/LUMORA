$ErrorActionPreference = 'Stop'

$protoRoot = Join-Path $PSScriptRoot '..\proto\lumora\v1'
$requiredFiles = @('common.proto', 'core.proto', 'agent.proto')

foreach ($requiredFile in $requiredFiles) {
    $path = Join-Path $protoRoot $requiredFile
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Missing protocol file: $requiredFile"
    }
}

$protoText = (
    $requiredFiles |
        ForEach-Object {
            Get-Content -Raw -LiteralPath (Join-Path $protoRoot $_)
        }
) -join [Environment]::NewLine

$requiredDefinitions = @(
    'package lumora.v1',
    'message RequestContext',
    'message ErrorDetail',
    'rpc Health',
    'service AgentService',
    'rpc PlanTask',
    'message TaskSnapshot',
    'message TaskEvent',
    'message ApprovalRequest',
    'WAITING_APPROVAL',
    'INTERRUPTED'
)

foreach ($definition in $requiredDefinitions) {
    if ($protoText -notmatch [regex]::Escape($definition)) {
        throw "Protocol contract is missing: $definition"
    }
}

$requestContextCount = (
    [regex]::Matches($protoText, 'message\s+RequestContext\s*\{')
).Count
if ($requestContextCount -ne 1) {
    throw "RequestContext must have exactly one definition."
}

foreach ($obsoleteDefinition in @(
    'service CoreService',
    'rpc CreateTask',
    'rpc GetTask',
    'rpc SubscribeTaskEvents',
    'rpc DecideApproval'
)) {
    if ($protoText -match [regex]::Escape($obsoleteDefinition)) {
        throw "Frontend REST contract must not remain in Protobuf: $obsoleteDefinition"
    }
}
