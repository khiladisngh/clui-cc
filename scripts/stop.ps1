# Clui CC — Stop all running instances
# Usage: powershell -ExecutionPolicy Bypass -File scripts\stop.ps1

$stopped = $false

# Kill Electron processes for this project
$electronProcs = Get-Process -Name "electron", "Electron" -ErrorAction SilentlyContinue
if ($electronProcs) {
    $electronProcs | Stop-Process -Force -ErrorAction SilentlyContinue
    Write-Host "  Stopped Electron processes." -ForegroundColor Yellow
    $stopped = $true
}

# Kill any "Clui CC" named processes
$cluiProcs = Get-Process -Name "Clui CC", "Clui*" -ErrorAction SilentlyContinue
if ($cluiProcs) {
    $cluiProcs | Stop-Process -Force -ErrorAction SilentlyContinue
    Write-Host "  Stopped Clui CC processes." -ForegroundColor Yellow
    $stopped = $true
}

if ($stopped) {
    Write-Host "Clui CC stopped." -ForegroundColor Green
} else {
    Write-Host "No running Clui CC instances found." -ForegroundColor Cyan
}
