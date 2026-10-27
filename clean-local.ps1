#requires -Version 7.0
<#
.SYNOPSIS
Preview or remove known generated files from this repository.
.DESCRIPTION
Run without parameters to preview. -Execute removes only validated, untracked
build and test outputs. Dependencies, user configuration, Git metadata and
desktop installers/checksums are retained. No application is stopped for you.
#>
[CmdletBinding()]
param(
    [switch]$Execute
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = [System.IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\', '/')
$rootPrefix = $root + [System.IO.Path]::DirectorySeparatorChar
$manifestPath = Join-Path $root 'package.json'
if (((Get-Item -LiteralPath $root -Force).Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw '仓库根目录是链接，已停止清理。'
}
if (-not (Test-Path -LiteralPath (Join-Path $root '.git')) -or
    -not (Test-Path -LiteralPath $manifestPath) -or
    (Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json).name -ne 'my-slim-pi-web') {
    throw '此脚本只能在 my-slim-pi-web 仓库中运行。'
}

$targets = [System.Collections.Generic.List[System.IO.FileSystemInfo]]::new()
function Add-ExistingTarget([string]$path) {
    if (Test-Path -LiteralPath $path) {
        $targets.Add((Get-Item -LiteralPath $path -Force))
    }
}

# Only known generated directories and test output. Dependencies and user settings stay.
foreach ($name in @('.desktop', '.next', '.local', 'test-results', 'coverage', 'out', 'build', 'tsconfig.tsbuildinfo')) {
    Add-ExistingTarget (Join-Path $root $name)
}
foreach ($name in @('.next', 'out', 'test-results', 'coverage')) {
    Add-ExistingTarget (Join-Path (Join-Path $root 'demo') $name)
}

Get-ChildItem -LiteralPath $root -Force -File |
    Where-Object {
        $_.Name -like '.local-*.log' -or
        ($_.Length -eq 0 -and $_.Name -match '^C.+pi-web-mcp-sign-in-route-[A-Za-z0-9]+command-ran$')
    } |
    ForEach-Object { $targets.Add($_) }

$dist = Join-Path $root 'dist-desktop'
if (Test-Path -LiteralPath $dist) {
    $distItem = Get-Item -LiteralPath $dist -Force
    if (($distItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'dist-desktop 是链接，已停止清理。'
    }
    Get-ChildItem -LiteralPath $dist -Force |
        Where-Object {
            ($_.PSIsContainer -and $_.Name -in @('win-unpacked', 'linux-unpacked', 'mac', 'mac-arm64')) -or
            (-not $_.PSIsContainer -and ($_.Name -like '*.blockmap' -or $_.Name -in @('builder-debug.yml', 'builder-effective-config.yaml')))
        } |
        ForEach-Object { $targets.Add($_) }
}

$targets = @($targets | Sort-Object FullName -Unique)
foreach ($item in $targets) {
    $full = [System.IO.Path]::GetFullPath($item.FullName)
    if (-not $full.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase) -or
        ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "目标不在仓库内，或目标是链接：$full"
    }
    # A safe-looking leaf below a linked demo/ directory can still refer outside
    # the checkout. Check every ancestor before any deletion takes place.
    $ancestor = [System.IO.Path]::GetDirectoryName($full)
    while ($ancestor -ne $root) {
        if (-not $ancestor.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase) -or
            ((Get-Item -LiteralPath $ancestor -Force).Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw "目标的父目录不在仓库内或是链接：$ancestor"
        }
        $ancestor = [System.IO.Path]::GetDirectoryName($ancestor)
    }
    $relative = [System.IO.Path]::GetRelativePath($root, $full).Replace('\', '/')
    $tracked = @(& git -C $root ls-files --cached -- $relative)
    if ($LASTEXITCODE -ne 0 -or $tracked.Count -ne 0) {
        throw "目标包含 Git 跟踪文件，已停止：$relative"
    }
}

if ($targets.Count -eq 0) {
    Write-Host '没有发现需要清理的已知构建或测试产物。'
    return
}

Write-Host "仓库：$root"
Write-Host "发现 $($targets.Count) 个清理目标："
foreach ($item in $targets) {
    Write-Host "  $([System.IO.Path]::GetRelativePath($root, $item.FullName))"
}
Write-Host '保留：node_modules、配置文件、Git 文件以及 dist-desktop 中的安装包和 .sha256。'

if (-not $Execute) {
    Write-Host '当前是预览模式，没有删除任何文件。确认清单后用 -Execute 运行。'
    return
}

$running = @(Get-CimInstance Win32_Process | Where-Object {
    $command = [string]$_.CommandLine
    $command.IndexOf($root, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -and
    ($_.Name -in @('MySlimPiWeb.exe', 'electron.exe', '7za.exe', '7z.exe', 'makensis.exe') -or
     ($_.Name -eq 'node.exe' -and $command -match '(?i)next[/\\]dist[/\\]bin[/\\]next|electron[/\\](scripts[/\\]|server[/\\]index\.cjs)|\.desktop[/\\](server|runtime)[/\\]'))
})
if ($running.Count -gt 0) {
    throw '检测到当前仓库的开发、桌面、测试或打包进程。请先关闭它，再重新运行。'
}

# Next.js creates junctions back into the repository's node_modules. Unlink
# those entries before recursively removing their parent output directories.
$nestedLinks = [System.Collections.Generic.List[System.IO.FileSystemInfo]]::new()
foreach ($item in $targets) {
    if (-not $item.PSIsContainer) { continue }
    $itemPrefix = [System.IO.Path]::GetFullPath($item.FullName) + [System.IO.Path]::DirectorySeparatorChar
    $pending = [System.Collections.Generic.Stack[string]]::new()
    $pending.Push($item.FullName)
    while ($pending.Count -gt 0) {
        foreach ($entry in (Get-ChildItem -LiteralPath $pending.Pop() -Force -ErrorAction Stop)) {
            $entryPath = [System.IO.Path]::GetFullPath($entry.FullName)
            if (-not $entryPath.StartsWith($itemPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
                throw "目录内路径异常，已停止清理：$entryPath"
            }
            if (($entry.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
                $nestedLinks.Add($entry)
            } elseif ($entry.PSIsContainer) {
                $pending.Push($entryPath)
            }
        }
    }
}
foreach ($link in $nestedLinks) {
    Remove-Item -LiteralPath $link.FullName -Force -ErrorAction Stop
}

$failed = [System.Collections.Generic.List[string]]::new()
foreach ($item in $targets) {
    try {
        if ($item.PSIsContainer) {
            Remove-Item -LiteralPath $item.FullName -Recurse -Force -ErrorAction Stop
        } else {
            Remove-Item -LiteralPath $item.FullName -Force -ErrorAction Stop
        }
        Write-Host "已删除：$([System.IO.Path]::GetRelativePath($root, $item.FullName))"
    } catch {
        $failed.Add($item.FullName)
        Write-Warning "删除失败：$($item.FullName)：$($_.Exception.Message)"
    }
}
if ($failed.Count -gt 0) {
    throw "$($failed.Count) 个目标未能删除；请检查上方警告。"
}
Write-Host '清理完成。'
