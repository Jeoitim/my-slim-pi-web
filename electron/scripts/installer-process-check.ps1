param([string]$NsisDirectory, [switch]$KeepFixture)
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$area = Join-Path $repo ('.local/installer-process-' + [guid]::NewGuid())
$install = Join-Path $area "O'Brien & 中文/My Slim Pi"
$helper = Join-Path $repo 'electron/installer/app-processes.ps1'
$windowsPowerShell = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
$engines = @($windowsPowerShell, (Get-Command pwsh).Source)
$processes = [Collections.Generic.List[object]]::new()
function Start-Fixture([string]$image) {
    $null = New-Item -ItemType Directory -Path (Split-Path $image) -Force
    Copy-Item -LiteralPath (Join-Path $area 'fixture.exe') -Destination $image
    $child = Start-Process -FilePath $image -WindowStyle Hidden -PassThru
    $processes.Add($child)
    return $child
}
function Assert-Alive($child) {
    $child.Refresh()
    if ($child.HasExited) { throw 'Unrelated fixture process was terminated' }
}
function Invoke-Check([string]$engine, [string]$action, [int]$expected, [int]$exclude = $PID, [string]$directory = $install) {
    & $engine -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $helper -Action $action -InstallDirectory $directory -AppExecutable MySlimPiWeb.exe -InstallerProcessId $exclude
    if ($LASTEXITCODE -ne $expected) { throw "$action returned $LASTEXITCODE, expected $expected ($engine)" }
}
try {
    $null = New-Item -ItemType Directory -Path $area -Force
    $source = Join-Path $area 'fixture.cs'
    Set-Content -LiteralPath $source -Value 'class Fixture { static void Main() { System.Threading.Thread.Sleep(-1); } }'
    & (Join-Path $env:SystemRoot 'Microsoft.NET/Framework64/v4.0.30319/csc.exe') /nologo /target:winexe "/out:$(Join-Path $area 'fixture.exe')" $source
    if ($LASTEXITCODE -ne 0) { throw 'Fixture compiler failed' }
    $uninstaller = Start-Fixture (Join-Path $install 'Uninstall MySlimPiWeb.exe')
    $setup = Start-Fixture (Join-Path $install 'setup.exe')
    $sibling = Start-Fixture (Join-Path ($install + '-other') 'MySlimPiWeb.exe')
    $other = Start-Fixture (Join-Path $area 'other-install/MySlimPiWeb.exe')
    foreach ($engine in $engines) {
        Invoke-Check $engine Check 1
        Invoke-Check $engine Stop 1
        Invoke-Check $engine Check 2 -directory 'relative-path'
        Invoke-Check $engine Stop 2 -directory 'C:\'
        $app = Start-Fixture (Join-Path $install 'MySlimPiWeb.exe')
        Invoke-Check $engine Check 0
        Invoke-Check $engine Check 1 -exclude $app.Id
        $node = Start-Fixture (Join-Path $install 'resources/runtime/node.exe')
        Invoke-Check $engine Check 0
        Invoke-Check $engine Stop 1
        foreach ($owned in @($app, $node)) {
            if (-not $owned.WaitForExit(5000)) { throw 'Owned application process survived stop' }
        }
        foreach ($ignored in @($uninstaller, $setup, $sibling, $other)) { Assert-Alive $ignored }
        Write-Host "PASS $([IO.Path]::GetFileName($engine)): self exclusion, path boundaries, other installs, backend stop, literal paths, query errors."
    }
    if ($NsisDirectory) {
        $compiler = Join-Path $NsisDirectory 'Bin/makensis.exe'
        if (-not (Test-Path -LiteralPath $compiler)) { $compiler = Join-Path $NsisDirectory 'makensis.exe' }
        $env:NSISDIR = $NsisDirectory
        # Harmless install/uninstall harness: no product registry, shortcuts or app files.
        # Run the same embedded hook from the install directory to reproduce self matching.
        $include = Join-Path $repo 'electron/installer/process-check.nsh'
        $harness = Join-Path $area 'harness.nsi'
        $text = @'
Unicode true
!include "MUI2.nsh"
!define PRODUCT_FILENAME "MySlimPiWeb"
!define PRODUCT_NAME "Installer process test"
!define VERSION "1"
!define PRODUCT_VERSION "1.0.0"
!include "@INCLUDE@"
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
LangString appRunning ${LANG_ENGLISH} "Application is running"
LangString appClosing ${LANG_ENGLISH} "Closing application"
LangString appCannotBeClosed ${LANG_ENGLISH} "Cannot close application"
Name "Isolated process hook test"
OutFile "@OUTPUT@"
RequestExecutionLevel user
SilentInstall silent
Section
  StrCpy $INSTDIR "@INSTALL@"
  !insertmacro customCheckAppRunning
  FileOpen $0 "$INSTDIR\@MARKER@" w
  FileWrite $0 "passed"
  FileClose $0
SectionEnd
'@
        foreach ($kind in @('install', 'uninstall')) {
            # Legacy makensis's output writer cannot create a Unicode filename;
            # the Unicode runtime itself must still handle the real target path.
            $output = Join-Path $area ($kind + '-harness.exe')
            $script = $text.Replace('@INCLUDE@', $include).Replace('@OUTPUT@', $output).Replace('@INSTALL@', $install).Replace('@MARKER@', ($kind + '.passed'))
            if ($kind -eq 'uninstall') {
                $uninstallImage = Join-Path $install 'uninstall-hook.exe'
                $script = "!define BUILD_UNINSTALLER`n" + $script.Replace("Section`n", "Section Uninstall`n") + "`nSection`n  WriteUninstaller `"$uninstallImage`"`nSectionEnd`n"
            }
            Set-Content -LiteralPath $harness -Value $script -Encoding utf8
            & $compiler /INPUTCHARSET UTF8 /V2 $harness
            if ($LASTEXITCODE -ne 0) { throw 'NSIS hook compilation failed' }
            $targetImage = Join-Path $install ($kind + '-harness.exe')
            Copy-Item -LiteralPath $output -Destination $targetImage
            $test = Start-Process -FilePath $targetImage -WindowStyle Hidden -PassThru
            $processes.Add($test)
            if (-not $test.WaitForExit(30000)) { throw 'NSIS hook harness timed out' }
            if ($kind -eq 'uninstall') {
                if ($test.ExitCode -ne 0) { throw 'NSIS harness uninstaller generation failed' }
                $test = Start-Process -FilePath $uninstallImage -ArgumentList @('/S', ('_?=' + $install)) -WindowStyle Hidden -PassThru
                $processes.Add($test)
                if (-not $test.WaitForExit(30000)) { throw 'NSIS uninstall hook timed out' }
            }
            if ($test.ExitCode -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $install ($kind + '.passed')))) { throw "NSIS $kind hook failed (exit $($test.ExitCode)); fixture: $area" }
            Write-Host "PASS NSIS $kind hook: embedded helper ran with literal directory args and ignored installer itself."
            Remove-Item -LiteralPath (Join-Path $install ($kind + '.passed'))
            $activeApp = Start-Fixture (Join-Path $install 'MySlimPiWeb.exe')
            $runImage = if ($kind -eq 'uninstall') { $uninstallImage } else { $targetImage }
            $arguments = if ($kind -eq 'uninstall') { @('/S', ('_?=' + $install)) } else { @('/S') }
            $blocked = Start-Process -FilePath $runImage -ArgumentList $arguments -WindowStyle Hidden -PassThru
            $processes.Add($blocked)
            if (-not $blocked.WaitForExit(30000) -or $blocked.ExitCode -ne 2) { throw 'Silent installer must report cancellation while an app is running' }
            if (Test-Path -LiteralPath (Join-Path $install ($kind + '.passed'))) { throw 'Installer continued over an active app' }
            Assert-Alive $activeApp
            Invoke-Check $windowsPowerShell Stop 1
            Write-Host "PASS NSIS $kind hook: silent execution reports cancellation and preserves active work."
        }
    }
} finally {
    foreach ($child in $processes) {
        $child.Refresh()
        if (-not $child.HasExited) {
            $image = (Get-CimInstance Win32_Process -Filter "ProcessId = $($child.Id)").ExecutablePath
            if ($image -and $image.StartsWith($area + '\', [StringComparison]::OrdinalIgnoreCase)) { Stop-Process -Id $child.Id -Force }
        }
    }
    $absolute = [IO.Path]::GetFullPath($area)
    if (-not $absolute.StartsWith((Join-Path $repo '.local') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe fixture cleanup path' }
    if (-not $KeepFixture -and (Test-Path -LiteralPath $absolute)) { Remove-Item -LiteralPath $absolute -Recurse -Force }
}
