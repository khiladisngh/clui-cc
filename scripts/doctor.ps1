# Clui CC environment doctor — read-only diagnostics, no installs.
# Usage: powershell -ExecutionPolicy Bypass -File scripts\doctor.ps1

Set-StrictMode -Version Latest

Write-Host "Clui CC Environment Check (Windows)" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

$script:fail = $false

function Test-VersionGte([string]$current, [string]$required) {
    try {
        $c = [version]$current
        $r = [version]$required
        return $c -ge $r
    } catch {
        return $false
    }
}

function Check([string]$label, [bool]$ok, [string]$detail) {
    if ($ok) {
        Write-Host "  PASS  $label — $detail" -ForegroundColor Green
    } else {
        Write-Host "  FAIL  $label — $detail" -ForegroundColor Red
        $script:fail = $true
    }
}

# Windows version
$osVersion = [System.Environment]::OSVersion.Version
if ($osVersion.Major -ge 10) {
    Check "Windows" $true "$($osVersion.Major).$($osVersion.Minor) (Build $($osVersion.Build))"
} else {
    Check "Windows" $false "$($osVersion.Major).$($osVersion.Minor) — requires Windows 10+"
}

# Node.js
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCmd) {
    $nodeVer = (node --version) -replace '^v', ''
    if (Test-VersionGte $nodeVer "18.0.0") {
        Check "Node.js" $true "v$nodeVer"
    } else {
        Check "Node.js" $false "v$nodeVer — requires 18+ — winget install OpenJS.NodeJS.LTS"
    }
} else {
    Check "Node.js" $false "not found — winget install OpenJS.NodeJS.LTS"
}

# npm
$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
if ($npmCmd) {
    $npmVer = npm --version
    Check "npm" $true "$npmVer"
} else {
    Check "npm" $false "not found — winget install OpenJS.NodeJS.LTS"
}

# Python 3
$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
if ($pythonCmd) {
    $pyOutput = python --version 2>&1
    if ($pyOutput -match "Python 3\.(\d+)\.(\d+)") {
        $pyVer = ($pyOutput -replace 'Python ', '')
        Check "Python 3" $true "$pyVer"
    } else {
        Check "Python 3" $false "$pyOutput — requires Python 3"
    }
} else {
    Check "Python 3" $false "not found — winget install Python.Python.3.11"
}

# VS Build Tools (C++ workload)
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (Test-Path $vswhere) {
    $vsInstall = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
    if ($vsInstall) {
        Check "VS Build Tools" $true "$vsInstall"
    } else {
        Check "VS Build Tools" $false "C++ workload not installed"
    }
} else {
    Check "VS Build Tools" $false "not found — install Visual Studio Build Tools with C++ workload"
}

# Claude CLI
$claudeCmd = Get-Command claude -ErrorAction SilentlyContinue
if ($claudeCmd) {
    $claudeVer = claude --version 2>$null
    if (-not $claudeVer) { $claudeVer = "unknown version" }
    Check "Claude CLI" $true "$claudeVer"
} else {
    Check "Claude CLI" $false "not found — npm install -g @anthropic-ai/claude-code"
}

Write-Host ""
if ($script:fail) {
    Write-Host "Some checks failed. Fix them above, then rerun:" -ForegroundColor Red
    Write-Host ""
    Write-Host "  .\start.bat" -ForegroundColor White
} else {
    Write-Host "Environment looks good." -ForegroundColor Green
}
