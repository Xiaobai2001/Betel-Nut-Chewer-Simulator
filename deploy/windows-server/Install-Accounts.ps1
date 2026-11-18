#Requires -RunAsAdministrator
[CmdletBinding()]
param([string]$PublicOrigin = '', [int]$Port = 8081)
$ErrorActionPreference = 'Stop'
$root = if (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'server')) { $PSScriptRoot } else { Split-Path (Split-Path $PSScriptRoot -Parent) -Parent }
$root = [IO.Path]::GetFullPath($root)
$node = (Get-Command node.exe -ErrorAction Stop).Source
$npm = (Get-Command npm.cmd -ErrorAction Stop).Source
if ([int](& $node -p "process.versions.node.split('.')[0]") -lt 24) { throw 'Install Node.js 24 LTS first.' }
if ($root.StartsWith('\\')) { throw 'Use a local folder, for example C:\ChewSimulator.' }
$taskName = 'ChewSimulatorAccounts'
$entry = Join-Path $root 'server\index.cjs'
if (-not (Test-Path -LiteralPath $entry)) { throw 'server/index.cjs is missing. Extract the complete ZIP first.' }
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
  if ($existing.Actions.Count -ne 1 -or $existing.Actions[0].Arguments -ne ('"' + $entry + '"')) { throw 'A different task uses this name. Review it before installing.' }
}
$configPath = Join-Path $root '.private\server.json'
if (-not (Test-Path -LiteralPath $configPath)) {
  $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
  if ($listener) { throw "Port $Port is in use. Choose another port with -Port." }
}
Push-Location $root
try {
  if ($existing) { Stop-ScheduledTask -TaskName $taskName }
  & $npm ci --prefix server --omit=dev --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Check the server Internet connection and retry.' }
  & {
    if ((-not (Test-Path -LiteralPath $configPath)) -and (-not $PublicOrigin)) { $PublicOrigin = Read-Host 'Public URL without trailing slash (example http://101.201.68.203:8081)' }
    if (Test-Path -LiteralPath $configPath) { Write-Host 'Upgrading database schema. Existing accounts and private configuration will be preserved.' }
    $adminUser = Read-Host 'MySQL admin user (Enter = root)'
    if (-not $adminUser) { $adminUser = 'root' }
    $dbPort = Read-Host 'Local MySQL port (Enter = 3306)'
    if (-not $dbPort) { $dbPort = '3306' }
    $secret = Read-Host 'MySQL admin password (hidden)' -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    try {
      $env:CHEW_ADMIN_USER = $adminUser
      $env:CHEW_ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
      $env:CHEW_DB_PORT = $dbPort
      $env:CHEW_PUBLIC_ORIGIN = $PublicOrigin
      $env:CHEW_PORT = [string]$Port
      $env:CHEW_CONFIG = $configPath
      & $node server/setup.cjs
      if ($LASTEXITCODE -ne 0) { throw 'Database setup failed. Check MySQL credentials and service status.' }
    } finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
      'CHEW_ADMIN_USER','CHEW_ADMIN_PASSWORD','CHEW_DB_PORT','CHEW_PUBLIC_ORIGIN','CHEW_PORT','CHEW_CONFIG' | ForEach-Object { Remove-Item -LiteralPath "Env:$_" -ErrorAction SilentlyContinue }
    }
  }
  $privateDir = Join-Path $root '.private'
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  & icacls.exe $privateDir /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' ("*" + $identity + ':(OI)(CI)F') /Q | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not protect the private configuration folder.' }
  # The generated file inherits the restricted parent ACL.
  & icacls.exe $configPath /reset /Q | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not protect the configuration file.' }
  $config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $Port = [int]$config.port
  $action = New-ScheduledTaskAction -Execute $node -Argument ('"' + $entry + '"') -WorkingDirectory $root
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  if ($existing) { Stop-ScheduledTask -TaskName $taskName }
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -User 'SYSTEM' -RunLevel Highest -Description ('Chew Simulator accounts: ' + $root) -Force | Out-Null
  $ruleName = 'ChewSimulatorAccountsTCP'
  $rule = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
  if ($rule) {
    if ($rule.Description -ne 'Chew Simulator accounts web server') { throw 'Firewall rule name already used by another app.' }
    $rule | Get-NetFirewallPortFilter | Set-NetFirewallPortFilter -LocalPort $Port | Out-Null
    $rule | Set-NetFirewallRule -Enabled True -Action Allow | Out-Null
  } else {
    New-NetFirewallRule -Name $ruleName -DisplayName 'Chew Simulator accounts HTTP' -Description 'Chew Simulator accounts web server' -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow | Out-Null
  }
  Start-ScheduledTask -TaskName $taskName
  $healthy = $false
  for ($i = 0; $i -lt 15; $i++) {
    Start-Sleep -Seconds 1
    try { $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 2; if ($health.ok) { $healthy = $true; break } } catch {}
  }
  if (-not $healthy) { throw 'Health check failed. See docs/accounts-server.md for diagnosis.' }
  Write-Host ('Ready: ' + $config.publicOrigin) -ForegroundColor Green
  Write-Host "Auto-start task: $taskName. Add inbound TCP $Port to the Aliyun security group."
  Write-Host 'Existing IIS and MySQL services were not changed.'
} finally { Pop-Location }
