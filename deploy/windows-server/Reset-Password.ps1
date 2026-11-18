param([Parameter(Mandatory=$true)][string]$Username)
$ErrorActionPreference = 'Stop'
$root = if (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'server')) { $PSScriptRoot } else { Split-Path (Split-Path $PSScriptRoot -Parent) -Parent }
$secret = Read-Host 'New website password (8-128 characters)' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
Push-Location $root
try {
  $env:CHEW_RESET_USER = $Username
  $env:CHEW_RESET_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  & node server/reset-password.cjs
  if ($LASTEXITCODE -ne 0) { throw 'Reset failed.' }
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  Remove-Item Env:CHEW_RESET_USER,Env:CHEW_RESET_PASSWORD -ErrorAction SilentlyContinue
  Pop-Location
}
