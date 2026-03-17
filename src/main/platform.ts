/**
 * Platform abstraction module.
 *
 * Centralizes all platform-specific logic (macOS vs Windows) so the rest of
 * the codebase can stay platform-agnostic. Every function detects the current
 * OS via `process.platform` and dispatches accordingly.
 */

import { execSync, spawn } from 'child_process'
import { existsSync, statSync } from 'fs'
import { homedir } from 'os'
import { join, dirname, delimiter } from 'path'
import { log as _log } from './logger'

const isWin = process.platform === 'win32'

function log(msg: string): void {
  _log('Platform', msg)
}

// ─── 1. findClaudeBinary ───

/**
 * Locate the `claude` CLI binary. Checks well-known install locations,
 * then falls back to asking the login shell. Returns `'claude'` as a
 * last resort (relies on PATH at spawn time).
 */
export function findClaudeBinary(): string {
  if (isWin) {
    const appData = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming')
    const localAppData = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')

    const candidates = [
      join(appData, 'npm', 'claude.cmd'),
      join(localAppData, 'npm', 'claude.cmd'),
      join(homedir(), '.npm-global', 'claude.cmd'),
    ]

    for (const c of candidates) {
      if (existsSync(c)) return c
    }

    try {
      const result = execSync('where.exe claude', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trim()
      const firstLine = result.split(/\r?\n/)[0]
      if (firstLine) return firstLine
    } catch {}

    return 'claude'
  }

  // macOS / Linux
  const candidates = [
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
    join(homedir(), '.npm-global/bin/claude'),
  ]

  for (const c of candidates) {
    if (existsSync(c)) return c
  }

  try {
    return execSync('/bin/zsh -lc "whence -p claude"', { encoding: 'utf-8' }).trim()
  } catch {}

  try {
    return execSync('/bin/bash -lc "which claude"', { encoding: 'utf-8' }).trim()
  } catch {}

  return 'claude'
}

// ─── 2. getLoginShellEnv ───

/**
 * Retrieve the login-shell PATH so Electron processes can find tools
 * (node, npx, etc.) that are only available in an interactive shell.
 *
 * On Windows, GUI apps inherit the full system/user PATH, so we just
 * return `process.env` as-is.
 */
export function getLoginShellEnv(): Record<string, string> {
  if (isWin) {
    // Windows GUI apps inherit full PATH — no login shell dance needed
    return { ...(process.env as Record<string, string>) }
  }

  // macOS / Linux: ask a login shell for its PATH
  const env: Record<string, string> = { ...(process.env as Record<string, string>) }
  try {
    const shellPath = execSync('/bin/zsh -lc "echo $PATH"', { encoding: 'utf-8' }).trim()
    if (shellPath) env.PATH = shellPath
  } catch {
    try {
      const shellPath = execSync('/bin/bash -lc "echo $PATH"', { encoding: 'utf-8' }).trim()
      if (shellPath) env.PATH = shellPath
    } catch {}
  }
  return env
}

// ─── 3. prependBinDir ───

/**
 * Prepend a binary's parent directory to a PATH string if not already present.
 * Uses `path.delimiter` (`:` on Unix, `;` on Windows) and `path.dirname()`.
 */
export function prependBinDir(envPath: string, binPath: string): string {
  const binDir = dirname(binPath)
  if (envPath.includes(binDir)) return envPath
  return `${binDir}${delimiter}${envPath}`
}

// ─── 4. openTerminal ───

/**
 * Open an external terminal window, optionally running `claude --resume <id>`.
 *
 * macOS: AppleScript -> Terminal.app.
 * Windows: `wt.exe` (Windows Terminal) first, fallback to `cmd.exe /k`.
 */
export function openTerminal(projectPath: string, claudeBin: string, sessionId?: string): void {
  const cmd = sessionId
    ? `${claudeBin} --resume ${sessionId}`
    : claudeBin

  if (isWin) {
    // Check if Windows Terminal is available before trying to spawn it
    let hasWt = false
    try {
      execSync('where.exe wt.exe', { stdio: 'ignore' })
      hasWt = true
    } catch {}

    if (hasWt) {
      try {
        const child = spawn('wt.exe', ['-d', projectPath, 'cmd', '/k', cmd], {
          detached: true,
          stdio: 'ignore',
        })
        child.unref()
        return
      } catch {}
    }

    const child = spawn('cmd.exe', ['/k', `cd /d "${projectPath}" && ${cmd}`], {
      detached: true,
      stdio: 'ignore',
    })
    child.unref()
    return
  }

  // macOS
  const escapedPath = projectPath.replace(/"/g, '\\"')
  const escapedCmd = cmd.replace(/"/g, '\\"')
  const script = `
    tell application "Terminal"
      activate
      do script "cd ${escapedPath} && ${escapedCmd}"
    end tell
  `
  const child = spawn('/usr/bin/osascript', ['-e', script], {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
}

// ─── 5. takeScreenshot ───

/**
 * Launch the platform's interactive screenshot tool.
 *
 * macOS: `/usr/sbin/screencapture -i <path>` (interactive crop).
 * Windows: `explorer.exe ms-screenclip:` (Win10 1809+), then save clipboard
 * contents to `screenshotPath` via PowerShell.
 *
 * Returns `true` if a screenshot file was produced.
 */
export async function takeScreenshot(screenshotPath: string): Promise<boolean> {
  if (isWin) {
    try {
      // Launch screen snip UI (goes to clipboard)
      execSync('explorer.exe ms-screenclip:', { stdio: 'ignore' })

      // Give the user time to take the screenshot (wait up to 30s, polling)
      const pollInterval = 1000
      const maxWait = 30000
      let elapsed = 0

      // Wait a moment for snipping tool to open
      await new Promise((r) => setTimeout(r, 2000))
      elapsed += 2000

      while (elapsed < maxWait) {
        try {
          // Check if clipboard has an image and save it
          const psScript = [
            'Add-Type -AssemblyName System.Windows.Forms;',
            '$img = [System.Windows.Forms.Clipboard]::GetImage();',
            `if($img){$img.Save([System.IO.Path]::GetFullPath($args[0])); Write-Output 'saved'}`,
          ].join(' ')
          const result = execSync(
            `powershell -NoProfile -command "& {${psScript}}" -- "${screenshotPath}"`,
            { encoding: 'utf-8', timeout: 5000 },
          ).trim()
          if (result === 'saved' && existsSync(screenshotPath)) return true
        } catch {}

        await new Promise((r) => setTimeout(r, pollInterval))
        elapsed += pollInterval
      }

      return false
    } catch {
      return false
    }
  }

  // macOS
  try {
    execSync(`/usr/sbin/screencapture -i "${screenshotPath}"`, { stdio: 'ignore' })
    return existsSync(screenshotPath)
  } catch {
    return false
  }
}

// ─── 6. findWhisperBinary ───

/**
 * Locate the whisper-cpp CLI binary, or return `null` if not found.
 */
export function findWhisperBinary(): string | null {
  if (isWin) {
    const localAppData = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
    const candidates = [
      join(localAppData, 'Programs', 'whisper-cpp', 'whisper-cli.exe'),
      join(homedir(), 'scoop', 'shims', 'whisper-cli.exe'),
      join('C:\\ProgramData', 'chocolatey', 'bin', 'whisper-cli.exe'),
    ]

    for (const c of candidates) {
      if (existsSync(c)) return c
    }

    try {
      const result = execSync('where.exe whisper-cli', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trim()
      const firstLine = result.split(/\r?\n/)[0]
      if (firstLine) return firstLine
    } catch {}

    return null
  }

  // macOS / Linux
  const candidates = [
    '/opt/homebrew/bin/whisper-cli',
    '/usr/local/bin/whisper-cli',
  ]

  for (const c of candidates) {
    if (existsSync(c)) return c
  }

  try {
    return execSync('/bin/zsh -lc "whence -p whisper-cli"', { encoding: 'utf-8' }).trim()
  } catch {}

  try {
    return execSync('/bin/bash -lc "which whisper-cli"', { encoding: 'utf-8' }).trim()
  } catch {}

  return null
}

// ─── 7. getWhisperModelCandidates ───

/**
 * Return directories that may contain whisper-cpp GGML model files.
 */
export function getWhisperModelCandidates(): string[] {
  if (isWin) {
    const localAppData = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
    return [
      join(localAppData, 'whisper-cpp', 'models'),
      join(homedir(), 'scoop', 'apps', 'whisper-cpp', 'current', 'models'),
    ]
  }

  return [
    join(homedir(), '.local', 'share', 'whisper'),
    '/opt/homebrew/share/whisper-cpp/models/',
  ]
}

// ─── 8. killProcessTree ───

/**
 * Kill a process (and its tree on Windows).
 *
 * macOS/Linux: SIGINT, then SIGKILL after 5 s.
 * Windows: `taskkill /pid <pid> /T /F` (kills entire tree immediately).
 */
export function killProcessTree(pid: number): void {
  if (isWin) {
    try {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' })
    } catch {
      log(`taskkill failed for PID ${pid}`)
    }
    return
  }

  // Unix: SIGINT first, SIGKILL fallback
  try {
    process.kill(pid, 'SIGINT')
  } catch {}

  setTimeout(() => {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // Already exited — ignore
    }
  }, 5000)
}

// ─── 9. testExecutable ───

/**
 * Cross-platform check: does `filePath` exist (and on Unix, is it executable)?
 */
export function testExecutable(filePath: string): boolean {
  if (!existsSync(filePath)) return false
  if (isWin) return true // Windows doesn't use execute bits
  try {
    const st = statSync(filePath)
    return (st.mode & 0o111) !== 0
  } catch {
    return false
  }
}

// ─── 10. installSkillFromTarball ───

/**
 * Download a tarball from `tarballUrl` and extract it into `tmpDir`,
 * stripping `pathDepth` leading path components and filtering to `subPath`.
 *
 * macOS: `curl -sL <url> | tar -xz ...`
 * Windows: PowerShell `Invoke-WebRequest` + `tar -xz` (tar ships with Win10+).
 */
export function installSkillFromTarball(
  tarballUrl: string,
  tmpDir: string,
  subPath: string,
  pathDepth: number,
): void {
  if (isWin) {
    const archivePath = join(tmpDir, '_download.tar.gz')
    // Download with PowerShell
    const psDownload = `Invoke-WebRequest -Uri '${tarballUrl}' -OutFile '${archivePath}'`
    execSync(`powershell -command "${psDownload}"`, { timeout: 60000, stdio: 'pipe' })
    // Extract with tar (available on Win10+)
    execSync(
      `tar -xzf "${archivePath}" --strip-components=${pathDepth} -C "${tmpDir}" "*/${subPath}"`,
      { timeout: 60000, stdio: 'pipe' },
    )
    // Clean up archive
    try {
      const { unlinkSync } = require('fs') as typeof import('fs')
      unlinkSync(archivePath)
    } catch {}
    return
  }

  // macOS / Linux: curl | tar pipeline
  const cmd = [
    `curl -sL "${tarballUrl}"`,
    '|',
    `tar -xz --strip-components=${pathDepth} -C "${tmpDir}" "*/${subPath}"`,
  ].join(' ')

  execSync(cmd, { timeout: 60000, stdio: 'pipe' })
}
