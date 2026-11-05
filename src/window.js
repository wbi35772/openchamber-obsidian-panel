import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const POWERSHELL = 'powershell.exe';

const runPowerShell = async (script, { timeout = 15_000 } = {}) => {
  const { stdout } = await execFileAsync(
    POWERSHELL,
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { timeout, windowsHide: true, maxBuffer: 1024 * 1024 },
  );
  return stdout.trim();
};

const psLiteral = (value) => `'${String(value ?? '').replace(/'/g, "''")}'`;

// Several vault windows share one Obsidian process, so the handle has to be
// matched by title instead of taking the process's MainWindowHandle.
const windowLookup = (needle) => `
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class OcWinMatch {
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int width, int height, uint flags);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
}
"@
$needle = ${psLiteral(needle)}
$procIds = @(Get-Process Obsidian -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$hit = New-Object 'object[]' 1
$hit[0] = [IntPtr]::Zero
$cb = [OcWinMatch+EnumProc]{
  param($hWnd, $lParam)
  $owner = 0
  [OcWinMatch]::GetWindowThreadProcessId($hWnd, [ref]$owner) | Out-Null
  if ($procIds -notcontains [int]$owner) { return $true }
  $sb = New-Object System.Text.StringBuilder 512
  [OcWinMatch]::GetWindowText($hWnd, $sb, $sb.Capacity) | Out-Null
  $title = $sb.ToString()
  if ($title -and $title.Contains($needle)) { $hit[0] = $hWnd; return $false }
  return $true
}
[OcWinMatch]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
if ($hit[0] -eq [IntPtr]::Zero) { Write-Output '0'; exit 0 }
`;

export const isRunning = async () => {
  try {
    const { stdout } = await execFileAsync(
      'tasklist.exe',
      ['/FI', 'IMAGENAME eq Obsidian.exe', '/FO', 'CSV', '/NH'],
      { timeout: 5_000, windowsHide: true, maxBuffer: 256 * 1024 },
    );
    return /obsidian\.exe/i.test(stdout);
  } catch {
    return false;
  }
};

export const restoreWindow = async (needle = '') => {
  const output = await runPowerShell(`${windowLookup(needle)}
[OcWinMatch]::ShowWindowAsync($hit[0], 4) | Out-Null
Write-Output 'ok'
`);
  return output === 'ok';
};

export const showWindow = async (needle = '') => {
  const output = await runPowerShell(`${windowLookup(needle)}
[OcWinMatch]::ShowWindowAsync($hit[0], 9) | Out-Null
[OcWinMatch]::SetForegroundWindow($hit[0]) | Out-Null
Write-Output 'ok'
`);
  return output === 'ok';
};

export const isMinimized = async (needle = '') => {
  const output = await runPowerShell(`${windowLookup(needle)}
Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);' -Name OcIconic -Namespace Oc
if ([Oc.OcIconic]::IsIconic($hit[0])) { Write-Output '1' } else { Write-Output '0' }
`);
  return output === '1';
};

export const minimizeWindow = async (needle = '') => {
  const output = await runPowerShell(`${windowLookup(needle)}
[OcWinMatch]::ShowWindowAsync($hit[0], 6) | Out-Null
Write-Output 'ok'
`);
  return output === 'ok';
};

// The surface viewer reports the panel in device pixels; Obsidian's window is
// frameless at devicePixelRatio 1, so the outer size is the rendered size and
// matching it removes the letterbox that swallowed clicks.
export const resizeWindow = async (needle, width, height) => {
  const w = Math.max(640, Math.min(4096, Math.round(Number(width) || 0)));
  const h = Math.max(480, Math.min(4096, Math.round(Number(height) || 0)));
  if (!(w > 0) || !(h > 0)) return false;
  const output = await runPowerShell(`${windowLookup(needle)}
[OcWinMatch]::SetWindowPos($hit[0], [IntPtr]::Zero, 0, 0, ${w}, ${h}, 0x0016) | Out-Null
Write-Output 'ok'
`);
  return output === 'ok';
};

export const closeWindow = async () => {
  const output = await runPowerShell(`
$p = Get-Process Obsidian -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { Write-Output '0'; exit 0 }
$null = $p.CloseMainWindow()
$null = $p.WaitForExit(5000)
if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }
Write-Output $p.Id
`);
  return output !== '0';
};

export const forceKill = async () => {
  await runPowerShell(`
Get-Process Obsidian -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Output 'ok'
`);
};

export const launchProcess = (executable, args) => {
  const child = spawn(executable, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.unref();
  return child.pid;
};
