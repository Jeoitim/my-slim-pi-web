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
  !ifndef BUILD_UNINSTALLER
    # Runs before uninstallOldVersion: the 0.13.0-jeoitim.1 payload nests build
    # output deep enough that the stock uninstaller's temp mirror cannot create
    # its directories, so it aborts and this installer retries forever.
    Call PiRepairLegacyInstall
  !endif
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

!ifndef BUILD_UNINSTALLER
Function PiRepairLegacyInstall
  Push $0
  Push $1
  Push $2
  InitPluginsDir
  File "/oname=$PLUGINSDIR\pi-app-processes.ps1" "${PI_PROCESS_HELPER}"
  System::Call 'kernel32::GetCurrentProcessId() i.r1'
  nsExec::Exec '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\pi-app-processes.ps1" -Action RepairLegacy -InstallDirectory "$INSTDIR" -AppExecutable "${PRODUCT_FILENAME}.exe" -InstallerProcessId $1'
  Pop $0
  StrCmp $0 1 pi_repair_done
  StrCpy $2 "The previous installation contains files that cannot be removed automatically. Close the application, then run the installer again."
  ${If} $LANGUAGE == 2052
    StrCpy $2 "旧版本安装目录中有文件无法自动清理。请关闭应用，然后重新运行安装程序。"
  ${ElseIf} $LANGUAGE == 1028
    StrCpy $2 "舊版本安裝目錄中有檔案無法自動清理。請關閉應用程式，然後重新執行安裝程式。"
  ${EndIf}
  MessageBox MB_OK|MB_ICONSTOP "$2"
  SetErrorLevel 2
  Quit
  pi_repair_done:
  Pop $2
  Pop $1
  Pop $0
FunctionEnd
!endif

!ifndef BUILD_UNINSTALLER
!macro customInstall
  Call PiClearInstalledCache
!macroend

Function PiClearInstalledCache
  Push $0
  Push $1
  Push $2
  InitPluginsDir
  File "/oname=$PLUGINSDIR\pi-app-processes.ps1" "${PI_PROCESS_HELPER}"
  System::Call 'kernel32::GetCurrentProcessId() i.r1'
  pi_cache_retry:
  nsExec::Exec '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\pi-app-processes.ps1" -Action ClearCache -InstallDirectory "$INSTDIR" -AppExecutable "${PRODUCT_FILENAME}.exe" -InstallerProcessId $1'
  Pop $0
  StrCmp $0 1 pi_cache_done
  StrCpy $2 "Files were installed, but the previous page cache could not be cleared. Close the app and retry."
  ${If} $LANGUAGE == 2052
    StrCpy $2 "安装文件已写入，但旧页面缓存无法清理。请退出应用后重试。"
  ${ElseIf} $LANGUAGE == 1028
    StrCpy $2 "安裝檔案已寫入，但舊頁面快取無法清除。請結束應用程式後重試。"
  ${EndIf}
  MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$2" /SD IDCANCEL IDRETRY pi_cache_retry
  SetErrorLevel 2
  Quit
  pi_cache_done:
  Pop $2
  Pop $1
  Pop $0
FunctionEnd
!endif
