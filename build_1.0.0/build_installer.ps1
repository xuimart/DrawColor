# build_installer.ps1 - compila o DrawColor_Setup.exe com o csc.exe do .NET Framework.
#
# O nome do EXE nao leva versao: o link permanente do GitHub
# (/releases/latest/download/DrawColor_Setup.exe) depende disso.

$ErrorActionPreference = 'Stop'
$csc      = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$buildDir = "e:\DrawColor\build_1.0.0"
$outFile  = "$buildDir\DrawColor_Setup.exe"

if (Test-Path $outFile) { Remove-Item $outFile -Force }

$cmdArgs = "/target:winexe /platform:anycpu /optimize+ " +
    "/win32icon:`"$buildDir\installer_icon.ico`" " +
    "/out:`"$outFile`" " +
    "/resource:`"$buildDir\drawcolor_plugin.zip`",drawcolor_plugin.zip " +
    "/r:System.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll " +
    "/r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll " +
    "/r:Microsoft.CSharp.dll " +
    "`"$buildDir\DrawColorInstaller.cs`""

$p = Start-Process -FilePath $csc -ArgumentList $cmdArgs -Wait -NoNewWindow -PassThru `
        -RedirectStandardOutput "$buildDir\_csc_out.txt" `
        -RedirectStandardError  "$buildDir\_csc_err.txt"

$report = @()
$report += "csc exit code: $($p.ExitCode)"
$report += ""
$report += "--- stdout ---"
$report += (Get-Content "$buildDir\_csc_out.txt" -ErrorAction SilentlyContinue)
$report += "--- stderr ---"
$report += (Get-Content "$buildDir\_csc_err.txt" -ErrorAction SilentlyContinue)
$report += ""
if (Test-Path $outFile) {
    $f = Get-Item $outFile
    $report += ("BUILT: {0}  ({1:N2} MB)" -f $f.Name, ($f.Length/1MB))
    $vi = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($outFile)
    $report += "FileVersion    : $($vi.FileVersion)"
    $report += "ProductVersion : $($vi.ProductVersion)"
} else {
    $report += "BUILD FAILED - exe not produced"
}
$report | Out-File "$buildDir\_build.txt" -Encoding UTF8
$report | ForEach-Object { Write-Output $_ }
