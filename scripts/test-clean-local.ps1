#requires -Version 7.0
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'Run these junction-safety checks on Windows with PowerShell 7.' }
$source = Join-Path (Split-Path $PSScriptRoot -Parent) 'clean-local.ps1'
$testArea = Join-Path ([System.IO.Path]::GetTempPath()) ('pi-web-clean-test-' + [guid]::NewGuid().ToString('N'))
$testArea = [System.IO.Path]::GetFullPath($testArea)
$links = [System.Collections.Generic.List[string]]::new()
$shell = (Get-Command pwsh).Source
function Assert-Check([bool]$condition, [string]$message) {
    if (-not $condition) { throw $message }
}
function New-Fixture([string]$name) {
    $directory = Join-Path $testArea $name
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    Copy-Item -LiteralPath $source -Destination (Join-Path $directory 'clean-local.ps1')
    Set-Content -LiteralPath (Join-Path $directory 'package.json') -Value '{"name":"my-slim-pi-web"}'
    & git -C $directory init --quiet
    if ($LASTEXITCODE -ne 0) { throw 'Cannot initialize the disposable fixture.' }
    return $directory
}
function Invoke-Clean([string]$directory, [bool]$execute, [bool]$expectFailure = $false) {
    $arguments = @('-NoProfile', '-File', (Join-Path $directory 'clean-local.ps1'))
    if ($execute) { $arguments += '-Execute' }
    $output = & $shell @arguments 2>&1
    $code = $LASTEXITCODE
    if (($expectFailure -and $code -eq 0) -or (-not $expectFailure -and $code -ne 0)) {
        throw "Unexpected cleanup exit code $code`: $output"
    }
}
function Add-Junction([string]$path, [string]$target) {
    New-Item -ItemType Junction -Path $path -Target $target | Out-Null
    $links.Add($path)
}
try {
    $external = Join-Path $testArea 'outside-checkout'
    New-Item -ItemType Directory -Path (Join-Path $external '.next') -Force | Out-Null
    $outsideMarker = Join-Path $external '.next/preserve.txt'
    Set-Content -LiteralPath $outsideMarker -Value 'Must survive all cleanup operations.'

    $normal = New-Fixture 'normal'
    foreach ($directory in @('.desktop', '.local', 'node_modules', 'dist-desktop', 'demo/.next')) {
        New-Item -ItemType Directory -Path (Join-Path $normal $directory) -Force | Out-Null
    }
    foreach ($file in @('.desktop/generated.txt', '.local/report.log', 'demo/.next/generated.txt', 'tsconfig.tsbuildinfo', 'dist-desktop/builder-debug.yml', 'dist-desktop/setup.exe.blockmap')) {
        Set-Content -LiteralPath (Join-Path $normal $file) -Value 'generated'
    }
    $preserved = @('node_modules/dependency.txt', '.env.local', 'package-lock.json', 'dist-desktop/setup.exe', 'dist-desktop/setup.exe.sha256')
    foreach ($file in $preserved) { Set-Content -LiteralPath (Join-Path $normal $file) -Value 'preserve' }
    Add-Junction (Join-Path $normal '.desktop/external-junction') $external
    Invoke-Clean $normal $false
    Assert-Check (Test-Path -LiteralPath (Join-Path $normal '.desktop/generated.txt')) 'Preview deleted generated files.'
    Invoke-Clean $normal $true
    foreach ($file in $preserved) { Assert-Check (Test-Path -LiteralPath (Join-Path $normal $file)) "Cleanup removed $file" }
    Assert-Check (Test-Path -LiteralPath (Join-Path $normal '.git')) 'Cleanup removed Git metadata.'
    Assert-Check (-not (Test-Path -LiteralPath (Join-Path $normal '.desktop'))) 'Generated directory was not removed.'
    Assert-Check (-not (Test-Path -LiteralPath (Join-Path $normal 'dist-desktop/setup.exe.blockmap'))) 'Blockmap was not removed.'
    Assert-Check (Test-Path -LiteralPath $outsideMarker) 'Cleanup followed a nested junction.'
    Invoke-Clean $normal $true

    $tracked = New-Fixture 'tracked'
    New-Item -ItemType Directory -Path (Join-Path $tracked '.local') | Out-Null
    Set-Content -LiteralPath (Join-Path $tracked '.local/tracked.txt') -Value 'tracked'
    & git -C $tracked add --force -- .local/tracked.txt
    if ($LASTEXITCODE -ne 0) { throw 'Cannot stage the tracked-file fixture.' }
    Invoke-Clean $tracked $true $true
    Assert-Check (Test-Path -LiteralPath (Join-Path $tracked '.local/tracked.txt')) 'Cleanup removed a tracked file.'

    $linked = New-Fixture 'linked-target'
    Add-Junction (Join-Path $linked '.local') $external
    Invoke-Clean $linked $true $true
    Assert-Check (Test-Path -LiteralPath $outsideMarker) 'Cleanup followed a linked target.'

    $ancestor = New-Fixture 'linked-ancestor'
    Add-Junction (Join-Path $ancestor 'demo') $external
    Invoke-Clean $ancestor $true $true
    Assert-Check (Test-Path -LiteralPath $outsideMarker) 'Cleanup followed a linked ancestor.'
    Write-Host 'Passed: preview, generated cleanup, retained inputs/installers, idempotence, tracked-file refusal, target/ancestor junction refusal and nested-junction safety.'
} finally {
    $expectedParent = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\', '/')
    if ([System.IO.Path]::GetDirectoryName($testArea) -ne $expectedParent -or
        [System.IO.Path]::GetFileName($testArea) -notlike 'pi-web-clean-test-*') {
        throw 'Refusing to delete a test directory outside the expected temporary parent.'
    }
    foreach ($link in $links) {
        if (Test-Path -LiteralPath $link) { Remove-Item -LiteralPath $link -Force }
    }
    if (Test-Path -LiteralPath $testArea) { Remove-Item -LiteralPath $testArea -Recurse -Force }
}
