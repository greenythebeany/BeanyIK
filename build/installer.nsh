; close a running BeanyIK before installing over it (same approach as JellyWave).
; electron-builder's default check uses a PowerShell one-liner with the install
; path in it, which breaks on usernames with Slovak characters. matching by
; image name with tasklist/taskkill doesn't care about the path.
!include "getProcessInfo.nsh"
Var pid

!macro customCheckAppRunning
  Var /GLOBAL IsPowerShellAvailable
  StrCpy $IsPowerShellAvailable 1

  ${GetProcessInfo} 0 $pid $1 $2 $3 $4
  ${if} $3 != "${APP_EXECUTABLE_FILENAME}"
    !insertmacro FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
    ${if} $R0 == 0
      DetailPrint "$(appClosing)"
      !insertmacro KILL_PROCESS "${APP_EXECUTABLE_FILENAME}" 0
      Sleep 300

      StrCpy $R1 0
      loop:
        IntOp $R1 $R1 + 1

        !insertmacro FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
        ${if} $R0 == 0
          Sleep 1000
          !insertmacro KILL_PROCESS "${APP_EXECUTABLE_FILENAME}" 1
          !insertmacro FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
          ${if} $R0 == 0
            DetailPrint `Waiting for "${PRODUCT_NAME}" to close.`
            Sleep 2000
          ${else}
            Goto not_running
          ${endIf}
        ${else}
          Goto not_running
        ${endIf}

        ; still alive after a forced kill, ask the user
        ${if} $R1 > 2
          MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY loop
          Quit
        ${else}
          Goto loop
        ${endIf}
      not_running:
    ${endIf}
  ${endIf}
!macroend
