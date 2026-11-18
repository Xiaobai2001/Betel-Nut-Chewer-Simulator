[CmdletBinding()]
param([string]$SiteRoot = 'C:\Sites\ChewSimulator')
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($SiteRoot))
$stateFile = Join-Path $root 'deployment-state.json'
$state = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
if (-not $state.previousPath -or $state.siteName -notmatch '^[A-Za-z0-9_-]+$') { throw 'No previous release is available.' }
$previous = [IO.Path]::GetFullPath($state.previousPath)
$prefix = (Join-Path $root 'releases').TrimEnd('\') + '\'
if (-not $previous.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath (Join-Path $previous 'release-manifest.json'))) { throw 'Invalid previous release directory.' }
Import-Module WebAdministration
$site = Get-Website -Name $state.siteName
if ([IO.Path]::GetFullPath([string]$site.physicalPath) -ne [IO.Path]::GetFullPath($state.currentPath)) { throw 'Site was changed outside this deployment. Check its current path first.' }
try {
    Set-ItemProperty -LiteralPath ("IIS:\Sites\" + $state.siteName) -Name physicalPath -Value $previous
    Start-Website -Name $state.siteName
    $response = Invoke-WebRequest -Uri ("http://127.0.0.1:" + $state.port + '/release-manifest.json') -UseBasicParsing -TimeoutSec 20
} catch {
    Set-ItemProperty -LiteralPath ("IIS:\Sites\" + $state.siteName) -Name physicalPath -Value $state.currentPath
    throw
}
$oldCurrent = $state.currentPath; $state.currentPath = $previous; $state.previousPath = $oldCurrent
$state.version = ($response.Content | ConvertFrom-Json).version
$state | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8
Write-Output "Rolled back to $($state.version). Both release directories are retained."
