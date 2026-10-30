!include "LogicLib.nsh"
!define PI_PROCESS_HELPER "${__FILEDIR__}\app-processes.ps1"
!ifdef BUILD_UNINSTALLER
  !define PI_CHECK_PREFIX "un."
!else
  !define PI_CHECK_PREFIX ""
!endif

# Supported electron-builder hook; never patch its generated installer templates.
!macro customCheckAppRunning
  Call ${PI_CHECK_PREFIX}PiCheckAppRunning
!macroend

Function ${PI_CHECK_PREFIX}PiCheckAppRunning
  Push $0
  Push $1
  Push $2
  InitPluginsDir
  File "/oname=$PLUGINSDIR\pi-app-processes.ps1" "${PI_PROCESS_HELPER}"
  System::Call 'kernel32::GetCurrentProcessId() i.r1'
  pi_check:
  nsExec::Exec '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\pi-app-processes.ps1" -Action Check -InstallDirectory "$INSTDIR" -AppExecutable "${PRODUCT_FILENAME}.exe" -InstallerProcessId $1'
  Pop $0
  StrCmp $0 1 pi_done
  StrCmp $0 0 pi_running pi_error
  pi_running:
  # Silent installs must not silently terminate active user work.
  MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(appRunning)" /SD IDCANCEL IDOK pi_stop
  SetErrorLevel 2
  Quit
  pi_stop:
  DetailPrint "$(appClosing)"
  nsExec::Exec '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\pi-app-processes.ps1" -Action Stop -InstallDirectory "$INSTDIR" -AppExecutable "${PRODUCT_FILENAME}.exe" -InstallerProcessId $1'
  Pop $0
  StrCmp $0 1 pi_done
  StrCmp $0 0 0 pi_error
  MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY pi_stop
  SetErrorLevel 2
  Quit
  pi_error:
  StrCpy $2 "Windows could not check application processes. Retry, or cancel installation."
  ${If} $LANGUAGE == 2052
    StrCpy $2 "Windows 无法检查应用进程。请重试，或取消安装。"
  ${ElseIf} $LANGUAGE == 1028
    StrCpy $2 "Windows 無法檢查應用程式行程。請重試，或取消安裝。"
  ${EndIf}
  MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$2" /SD IDCANCEL IDRETRY pi_check
  SetErrorLevel 2
  Quit
  pi_done:
  Pop $2
  Pop $1
  Pop $0
FunctionEnd
