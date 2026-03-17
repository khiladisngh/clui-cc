# Clui CC — Windows setup and launcher
# Usage: powershell -ExecutionPolicy Bypass -File scripts\start.ps1

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoDir = Split-Path -Parent $PSScriptRoot
if (-not $repoDir) { $repoDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
Set-Location $repoDir

# ── Helpers ──

$script:preflight_failed = $false

function Step([string]$msg) {
    Write-Host ""
    Write-Host "--- $msg" -ForegroundColor Cyan
}

function Pass([string]$msg) {
    Write-Host "  OK: $msg" -ForegroundColor Green
}

function Fail([string]$msg) {
    Write-Host "  FAIL: $msg" -ForegroundColor Red
    $script:preflight_failed = $true
}

function Fix([string]$msg) {
    Write-Host ""
    Write-Host "  To fix, copy and run this command:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "    $msg" -ForegroundColor White
    Write-Host ""
}

function Test-VersionGte([string]$current, [string]$required) {
    try {
        $c = [version]$current
        $r = [version]$required
        return $c -ge $r
    } catch {
        return $false
    }
}

# ── Preflight Checks ──

Step "Checking environment"

# 0. Windows version (Windows 10+)
$osVersion = [System.Environment]::OSVersion.Version
if ($osVersion.Major -ge 10) {
    Pass "Windows $($osVersion.Major).$($osVersion.Minor) (Build $($osVersion.Build))"
} else {
    Fail "Windows $($osVersion.Major).$($osVersion.Minor) is too old. Clui CC requires Windows 10+."
}

# 1. Node.js 18+
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCmd) {
    $nodeVer = (node --version) -replace '^v', ''
    if (Test-VersionGte $nodeVer "18.0.0") {
        Pass "Node.js v$nodeVer"
    } else {
        Fail "Node.js v$nodeVer is too old. Clui CC requires Node 18+."
        Fix "winget install OpenJS.NodeJS.LTS"
    }
} else {
    Fail "Node.js is not installed."
    Fix "winget install OpenJS.NodeJS.LTS"
}

# 2. npm
$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
if ($npmCmd) {
    $npmVer = npm --version
    Pass "npm $npmVer"
} else {
    Fail "npm is not installed (should come with Node.js)."
    Fix "winget install OpenJS.NodeJS.LTS"
}

# 3. Python 3
$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
if ($pythonCmd) {
    $pyOutput = python --version 2>&1
    if ($pyOutput -match "Python 3") {
        $pyVer = ($pyOutput -replace 'Python ', '')
        Pass "Python $pyVer"
    } else {
        Fail "Python 3 is required but found: $pyOutput"
        Fix "winget install Python.Python.3.11"
    }
} else {
    Fail "Python 3 is not installed."
    Fix "winget install Python.Python.3.11"
}

# 4. Visual Studio Build Tools (C++ workload)
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (Test-Path $vswhere) {
    $vsInstall = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
    if ($vsInstall) {
        Pass "VS Build Tools at $vsInstall"
    } else {
        Fail "Visual Studio C++ Build Tools not found."
        Fix "winget install Microsoft.VisualStudio.2022.BuildTools --override `"--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --passive`""
    }
} else {
    Fail "Visual Studio Build Tools not found."
    Fix "winget install Microsoft.VisualStudio.2022.BuildTools --override `"--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --passive`""
}

# 5. Claude CLI
$claudeCmd = Get-Command claude -ErrorAction SilentlyContinue
if ($claudeCmd) {
    $claudeVer = claude --version 2>$null
    if (-not $claudeVer) { $claudeVer = "unknown" }
    Pass "Claude Code CLI ($claudeVer)"
} else {
    Fail "Claude Code CLI is not installed."
    Fix "npm install -g @anthropic-ai/claude-code"
}

# Bail if any check failed
if ($script:preflight_failed) {
    Write-Host ""
    Write-Host "Some checks failed. Fix them above, then rerun:" -ForegroundColor Red
    Write-Host ""
    Write-Host "  .\start.bat" -ForegroundColor White
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host "All checks passed." -ForegroundColor Green

# ── Install ──

if (-not (Test-Path "node_modules")) {
    Step "Installing dependencies"
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "npm install failed. Common fixes:" -ForegroundColor Red
        Write-Host ""
        Write-Host "  1. Install VS Build Tools:"
        Write-Host '     winget install Microsoft.VisualStudio.2022.BuildTools --override "--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --passive"'
        Write-Host ""
        Write-Host "  2. Rerun this script:"
        Write-Host "     .\start.bat"
        Write-Host ""
        exit 1
    }
}

# ── Build ──

Step "Building Clui CC"
npx electron-vite build --mode production
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Build failed. Common fixes:" -ForegroundColor Red
    Write-Host ""
    Write-Host "  1. Delete node_modules and reinstall:"
    Write-Host "     Remove-Item -Recurse -Force node_modules; npm install"
    Write-Host ""
    Write-Host "  2. Rerun this script:"
    Write-Host "     .\start.bat"
    Write-Host ""
    exit 1
}

# ── Launch ──

Step "Launching Clui CC"
Write-Host "  Alt+Space to toggle the overlay." -ForegroundColor Cyan
Write-Host "  Use stop.bat or tray icon > Quit to close." -ForegroundColor Cyan
Write-Host ""
npx electron .
