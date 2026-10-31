param([switch]$KeepFixture)
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$area = Join-Path $repo ('.local/installer-legacy-' + [guid]::NewGuid())
$install = Join-Path $area "O'Brien & 中文/My Slim Pi"
$server = Join-Path $install 'resources/server'
$helper = Join-Path $repo 'electron/installer/app-processes.ps1'
$windowsPowerShell = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
$engines = @($windowsPowerShell, (Get-Command pwsh).Source)

function Invoke-Repair([string]$engine, [int]$expected) {
    & $engine -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $helper -Action RepairLegacy -InstallDirectory $install -AppExecutable MySlimPiWeb.exe -InstallerProcessId $PID
    if ($LASTEXITCODE -ne $expected) { throw "RepairLegacy returned $LASTEXITCODE, expected $expected ($engine)" }
}

function New-LegacyTree {
    $null = New-Item -ItemType Directory -Path $server -Force
    Set-Content -LiteralPath (Join-Path $server 'keep.txt') -Value 'keep'
    $next = Join-Path $server '.desktop/next'
    $null = New-Item -ItemType Directory -Path $next -Force
    Set-Content -LiteralPath (Join-Path $next 'keep.json') -Value 'keep'
    $deep = Join-Path $server '.desktop/server'
    foreach ($segment in @(('d' * 60), ('e' * 60), ('f' * 60), ('g' * 60))) { $deep = Join-Path $deep $segment }
    $null = [IO.Directory]::CreateDirectory('\\?\' + $deep)
    [IO.File]::WriteAllText('\\?\' + (Join-Path $deep 'deep.txt'), 'deep')
    $null = [IO.Directory]::CreateDirectory((Join-Path $server '.desktop/server/dist-desktop'))
    $dist = Join-Path $server 'dist-desktop/win-unpacked/resources/server/.desktop/server'
    $null = [IO.Directory]::CreateDirectory('\\?\' + $dist)
    [IO.File]::WriteAllText('\\?\' + (Join-Path $dist 'nested.txt'), 'nested')
    $local = Join-Path $server '.local/upstream013-agent'
    $null = New-Item -ItemType Directory -Path $local -Force
    Set-Content -LiteralPath (Join-Path $local 'mcp.json') -Value '{}'
}

function Assert-Kept {
    if (-not (Test-Path -LiteralPath (Join-Path $server 'keep.txt'))) { throw 'Repair removed an unrelated server file' }
    if (-not (Test-Path -LiteralPath (Join-Path $server '.desktop/next/keep.json'))) { throw 'Repair removed the Next build' }
}

try {
    $null = New-Item -ItemType Directory -Path $area -Force
    foreach ($engine in $engines) {
        New-LegacyTree
        Invoke-Repair $engine 1
        foreach ($relative in @('.desktop/server', 'dist-desktop', '.local')) {
            if (Test-Path -LiteralPath (Join-Path $server $relative)) { throw "Legacy path was not removed: $relative" }
        }
        Assert-Kept
        Invoke-Repair $engine 1
        Assert-Kept
        Write-Host "PASS $([IO.Path]::GetFileName($engine)): deep legacy tree removed, clean tree unchanged."

        $legitimateServer = Join-Path $server '.desktop/server'
        $null = New-Item -ItemType Directory -Path $legitimateServer -Force
        Invoke-Repair $engine 1
        if (-not (Test-Path -LiteralPath $legitimateServer)) { throw 'Repair removed a legitimate .desktop\server directory' }
        Remove-Item -LiteralPath $legitimateServer -Force
        Write-Host "PASS $([IO.Path]::GetFileName($engine)): an empty .desktop/server without legacy markers is kept."

        $external = Join-Path $area 'external'
        $null = New-Item -ItemType Directory -Path $external -Force
        Set-Content -LiteralPath (Join-Path $external 'sentinel.txt') -Value 'safe'
        $null = New-Item -ItemType Directory -Path (Join-Path $server 'dist-desktop') -Force
        $link = Join-Path $server '.desktop/server'
        $null = New-Item -ItemType Directory -Path (Split-Path $link -Parent) -Force
        $null = New-Item -ItemType Junction -Path $link -Target $external
        Invoke-Repair $engine 2
        if (-not (Test-Path -LiteralPath (Join-Path $external 'sentinel.txt'))) { throw 'Repair followed a junction' }
        [IO.Directory]::Delete($link)
        Remove-Item -LiteralPath (Join-Path $server 'dist-desktop') -Force
        Write-Host "PASS $([IO.Path]::GetFileName($engine)): linked legacy path is refused without touching its target."
    }
} finally {
    $absolute = [IO.Path]::GetFullPath($area)
    if (-not $absolute.StartsWith((Join-Path $repo '.local') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe fixture cleanup path' }
    $link = Join-Path $server '.desktop/server'
    if (Test-Path -LiteralPath $link) {
        $entry = Get-Item -LiteralPath $link -Force
        if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { [IO.Directory]::Delete($link) }
    }
    if (-not $KeepFixture -and (Test-Path -LiteralPath $absolute)) { [IO.Directory]::Delete('\\?\' + $absolute, $true) }
}
