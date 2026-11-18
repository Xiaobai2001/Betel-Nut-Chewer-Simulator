#Requires -RunAsAdministrator
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$package = [IO.Path]::GetFullPath($PSScriptRoot)
$taskName = 'ChewSimulatorAccounts'
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
if ($task.Actions.Count -ne 1 -or -not $task.Actions[0].WorkingDirectory) { throw 'Cannot identify the existing installation. No files changed.' }
$target = [IO.Path]::GetFullPath($task.Actions[0].WorkingDirectory)
$entry = Join-Path $target 'server\index.cjs'
if ($task.Actions[0].Arguments -ne ('"' + $entry + '"')) { throw 'Task entry does not match the installation folder. No files changed.' }
if ($package -eq $target -or $package.StartsWith($target.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Extract the new ZIP into a separate folder, outside the existing installation, then run this script there.' }
$configPath = Join-Path $target '.private\server.json'
if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) { throw 'Existing .private/server.json is missing. Restore that file first; do not create a new database.' }
foreach ($required in @('app\index.html','server\package-lock.json','server\backup.cjs','Install-Accounts.ps1')) {
  if (-not (Test-Path -LiteralPath (Join-Path $package $required) -PathType Leaf)) { throw "Incomplete update package: $required" }
}
$node = (Get-Command node.exe -ErrorAction Stop).Source
$npm = (Get-Command npm.cmd -ErrorAction Stop).Source
if ([int](& $node -p "process.versions.node.split('.')[0]") -lt 24) { throw 'Install Node.js 24 LTS first.' }
$backup = Join-Path $target ('.private\backups\' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
New-Item -ItemType Directory -Path $backup -Force | Out-Null
# Inherit the existing private folder ACL: this backup contains account hashes and config.
Copy-Item -LiteralPath $configPath -Destination (Join-Path $backup 'server.json')
$changed = $false
Write-Host ('Existing installation: ' + $target)
Write-Host ('Private backup: ' + $backup)
try {
  Stop-ScheduledTask -TaskName $taskName
  for ($i = 0; $i -lt 20; $i++) {
    if ((Get-ScheduledTask -TaskName $taskName).State -ne 'Running') { break }
    Start-Sleep -Milliseconds 250
  }
  if ((Get-ScheduledTask -TaskName $taskName).State -eq 'Running') { throw 'Existing task did not stop. No files changed.' }
  & $node (Join-Path $package 'server\backup.cjs') $target (Join-Path $backup 'database.sql')
  if ($LASTEXITCODE -ne 0) { throw 'Database backup failed. No update files copied.' }
  foreach ($folder in @('app','server','docs')) {
    $old = Join-Path $target $folder
    if (Test-Path -LiteralPath $old) { Copy-Item -LiteralPath $old -Destination $backup -Recurse }
  }
  $changed = $true
  foreach ($folder in @('app','server','docs')) {
    $source = Join-Path $package $folder
    if (Test-Path -LiteralPath $source) {
      $destination = Join-Path $target $folder
      New-Item -ItemType Directory -Path $destination -Force | Out-Null
      Get-ChildItem -LiteralPath $source -Force | Where-Object { $_.Name -ne 'node_modules' } | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $destination -Recurse -Force }
    }
  }
  foreach ($name in @('Install-Accounts.ps1','Reset-Password.ps1','Update-Accounts.ps1','README.md')) {
    Copy-Item -LiteralPath (Join-Path $package $name) -Destination (Join-Path $target $name) -Force
  }
  & (Join-Path $target 'Install-Accounts.ps1')
  Write-Host 'Update complete. Original database, account IDs and private configuration retained.' -ForegroundColor Green
  Write-Host ('Backup retained: ' + $backup)
} catch {
  $failure = $_
  if ($changed) {
    Write-Host 'Update failed. Restoring previous application files; database is not cleared.' -ForegroundColor Yellow
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    foreach ($folder in @('app','server','docs')) {
      $old = Join-Path $backup $folder
      if (Test-Path -LiteralPath $old) { Get-ChildItem -LiteralPath $old -Force | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $target $folder) -Recurse -Force } }
    }
    & $npm ci --prefix (Join-Path $target 'server') --omit=dev --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { Write-Warning ('Dependency rollback needs attention. Backup: ' + $backup) }
  }
  Start-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  throw $failure
}
