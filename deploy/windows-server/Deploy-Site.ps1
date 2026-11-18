# Run in an elevated Windows PowerShell session on the Windows Server.
[CmdletBinding()]
param(
    [ValidatePattern('^[A-Za-z0-9_-]+$')][string]$SiteName = 'ChewSimulator',
    [string]$SiteRoot = 'C:\Sites\ChewSimulator',
    [ValidateRange(1, 65535)][int]$Port = 8080,
    [switch]$OpenFirewall
)
$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Run as Administrator on the Windows Server.' }
$source = Join-Path $PSScriptRoot 'site'
$manifestFile = Join-Path $source 'release-manifest.json'
if (-not (Test-Path -LiteralPath $manifestFile)) { throw 'Extract the complete server package first. The site folder is missing.' }
$manifest = Get-Content -LiteralPath $manifestFile -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.format -ne 'chew-static-release-v1' -or $manifest.version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid release manifest.' }
$source = [IO.Path]::GetFullPath($source)
$sourcePrefix = $source.TrimEnd('\') + '\'
foreach ($entry in $manifest.files) {
    $file = [IO.Path]::GetFullPath((Join-Path $source $entry.path))
    if (-not $file.StartsWith($sourcePrefix, [StringComparison]::OrdinalIgnoreCase) -or $entry.path -match '[:\\]' -or $entry.path.Split('/') -contains '..') { throw 'Unsafe release path.' }
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing release file: $($entry.path)" }
    if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256) { throw "Hash mismatch: $($entry.path)" }
}
$actualFiles = @(Get-ChildItem -LiteralPath $source -File -Recurse -Force)
if ($actualFiles.Count -ne @($manifest.files).Count + 1) { throw 'Unexpected file in the site folder. Use a freshly extracted package.' }
if (Get-ChildItem -LiteralPath $source -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }) { throw 'Links are not allowed in the site package.' }
if (-not (Get-Command Install-WindowsFeature -ErrorAction SilentlyContinue)) { throw 'This script requires Windows Server, not a desktop PC.' }
$features = @('Web-Server', 'Web-Static-Content', 'Web-Default-Doc', 'Web-Http-Errors', 'Web-Filtering', 'Web-Mgmt-Console')
$missing = @(Get-WindowsFeature -Name $features | Where-Object { -not $_.Installed })
if ($missing.Count) {
    $installed = Install-WindowsFeature -Name @($missing.Name) -IncludeManagementTools
    if (-not $installed.Success) { throw 'IIS installation failed.' }
    if ([string]$installed.RestartNeeded -eq 'Yes') { throw 'Restart Windows Server, then run this script again.' }
}
Import-Module WebAdministration
$root = [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($SiteRoot))
if ($root -eq [IO.Path]::GetPathRoot($root)) { throw 'SiteRoot must be a dedicated subdirectory.' }
$rootPrefix = $root.TrimEnd('\') + '\'
$site = Get-Website -Name $SiteName -ErrorAction SilentlyContinue
$previousPath = $null
if ($site) {
    $previousPath = [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables([string]$site.physicalPath))
    if (-not $previousPath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Existing site is outside SiteRoot. Choose another SiteName.' }
    $binding = @($site.Bindings.Collection | Where-Object { $_.protocol -eq 'http' -and $_.bindingInformation -eq "*:${Port}:" })
    if (-not $binding.Count) { throw 'Existing site has a different binding. Do not reuse its name.' }
}
foreach ($otherSite in @(Get-Website | Where-Object { $_.Name -ne $SiteName })) {
    if ($otherSite.Bindings.Collection | Where-Object { $_.bindingInformation -match (':' + $Port + ':') }) { throw "Port is used by IIS site $($otherSite.Name). Choose another port." }
}
if (-not $site -and (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)) { throw 'Port is already in use. Choose another port.' }
$releaseId = $manifest.version + '-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff')
$target = [IO.Path]::GetFullPath((Join-Path $root ('releases\' + $releaseId)))
if (-not $target.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $target)) { throw 'Invalid or existing release directory.' }
New-Item -ItemType Directory -Path $target -Force | Out-Null
Get-ChildItem -LiteralPath $source -Force | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $target -Recurse }
$accessArgs = @($target, '/grant', '*S-1-5-32-568:(OI)(CI)(RX)', '*S-1-5-17:(OI)(CI)(RX)', '/T', '/Q')
& icacls.exe @accessArgs | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Unable to grant IIS read access to the release.' }
$created = $false
try {
    if ($site) { Set-ItemProperty -LiteralPath "IIS:\Sites\$SiteName" -Name physicalPath -Value $target }
    else { New-Website -Name $SiteName -Port $Port -PhysicalPath $target -ApplicationPool 'DefaultAppPool' | Out-Null; $created = $true }
    Start-Website -Name $SiteName
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/release-manifest.json" -UseBasicParsing -TimeoutSec 20
    $served = $response.Content | ConvertFrom-Json
    if ($response.StatusCode -ne 200 -or $served.version -ne $manifest.version) { throw 'Local HTTP verification failed.' }
} catch {
    if ($previousPath) { Set-ItemProperty -LiteralPath "IIS:\Sites\$SiteName" -Name physicalPath -Value $previousPath }
    elseif ($created) { Stop-Website -Name $SiteName }
    throw
}
$state = [ordered]@{ siteName = $SiteName; port = $Port; currentPath = $target; previousPath = $previousPath; version = $manifest.version }
$state | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root 'deployment-state.json') -Encoding UTF8
if ($OpenFirewall) {
    $ruleName = "ChewSimulator-HTTP-$Port"
    if (-not (Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue)) { New-NetFirewallRule -Name $ruleName -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port | Out-Null }
}
Write-Output "Deployment verified locally: http://127.0.0.1:$Port/"
Write-Output "Downloads: http://SERVER_IP:$Port/download.html"
Write-Output 'Allow the same TCP port in the cloud security group. Public reachability was not tested here.'
Write-Output "Previous release retained at: $previousPath"
