param(
    [Parameter(Mandatory = $true)][ValidateSet('Check', 'Stop')][string]$Action,
    [Parameter(Mandatory = $true)][string]$InstallDirectory,
    [Parameter(Mandatory = $true)][string]$AppExecutable,
    [Parameter(Mandatory = $true)][int]$InstallerProcessId
)

# Windows PowerShell 5.1 is bundled with Windows; do not depend on user profiles,
# PATH, a separately installed pwsh, or evaluation of directory names as code.
$ErrorActionPreference = 'Stop'
try {
    if ($InstallDirectory -notmatch '^(?:[A-Za-z]:[\\/]|\\\\[^\\]+\\[^\\]+)' -or
        $InstallDirectory.StartsWith('\\.\') -or $InstallDirectory.StartsWith('\\?\') -or
        $AppExecutable -notmatch '^[^\\/:*?"<>|]+\.exe$' -or $InstallerProcessId -le 0) {
        throw 'Invalid installation process scope'
    }
    $installRoot = [IO.Path]::GetFullPath($InstallDirectory).TrimEnd('\', '/')
    if ($installRoot -eq [IO.Path]::GetPathRoot($installRoot + '\').TrimEnd('\', '/')) {
        throw 'Installation directory must not be a filesystem root'
    }
    $appPath = [IO.Path]::Combine($installRoot, $AppExecutable)
    $resourcePrefix = [IO.Path]::Combine($installRoot, 'resources') + '\'
    function Test-OwnedProcess($process) {
        if ($process.ProcessId -eq $InstallerProcessId -or -not $process.ExecutablePath) { return $false }
        $image = [string]$process.ExecutablePath
        return $image.Equals($appPath, [StringComparison]::OrdinalIgnoreCase) -or
            $image.StartsWith($resourcePrefix, [StringComparison]::OrdinalIgnoreCase)
    }
    function Get-OwnedProcesses {
        @(Get-CimInstance -ClassName Win32_Process | Where-Object { Test-OwnedProcess $_ })
    }
    $owned = @(Get-OwnedProcesses)
    if ($Action -eq 'Stop') {
        foreach ($process in $owned) {
            # Recheck both PID and image before acting (the original PID may exit).
            $current = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $($process.ProcessId)"
            if ($current -and (Test-OwnedProcess $current) -and $current.CreationDate -eq $process.CreationDate) {
                try { Stop-Process -Id $current.ProcessId -Force }
                catch {
                    if (Get-Process -Id $current.ProcessId -ErrorAction SilentlyContinue) { throw }
                }
            }
        }
        # Let the owned backend and Electron children finish exiting before files change.
        for ($attempt = 0; $attempt -lt 20; $attempt++) {
            $owned = @(Get-OwnedProcesses)
            if ($owned.Count -eq 0) { break }
            Start-Sleep -Milliseconds 250
        }
    }
    if ($owned.Count -gt 0) { exit 0 }
    exit 1
} catch {
    # A failed process query is distinct from a positive running-app result.
    exit 2
}
