Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$toolsDir = Join-Path $root ".tools"
$cacheDir = Join-Path $toolsDir "cache"
$ghDir = Join-Path $toolsDir "gh"
$supabaseDir = Join-Path $toolsDir "supabase"

function Get-LatestRelease {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Repository
  )

  $url = "https://api.github.com/repos/$Repository/releases/latest"
  return Invoke-RestMethod -Uri $url
}

function Get-AssetUrl {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Release,
    [Parameter(Mandatory = $true)]
    [string]$AssetName
  )

  $asset = $Release.assets | Where-Object { $_.name -eq $AssetName } | Select-Object -First 1
  if (-not $asset) {
    throw "Asset '$AssetName' nao encontrado na release $($Release.tag_name)."
  }

  return $asset.browser_download_url
}

function Download-File {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Url,
    [Parameter(Mandatory = $true)]
    [string]$Destination
  )

  Invoke-WebRequest -Uri $Url -OutFile $Destination
}

New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null

$ghRelease = Get-LatestRelease -Repository "cli/cli"
$ghZip = Join-Path $cacheDir "gh_windows_amd64.zip"
$ghUrl = Get-AssetUrl -Release $ghRelease -AssetName ("gh_{0}_windows_amd64.zip" -f $ghRelease.tag_name.TrimStart("v"))
Download-File -Url $ghUrl -Destination $ghZip
if (Test-Path $ghDir) {
  Remove-Item -Recurse -Force $ghDir
}
Expand-Archive -Path $ghZip -DestinationPath $ghDir

$supabaseRelease = Get-LatestRelease -Repository "supabase/cli"
$supabaseArchive = Join-Path $cacheDir "supabase_windows_amd64.tar.gz"
$supabaseUrl = Get-AssetUrl -Release $supabaseRelease -AssetName "supabase_windows_amd64.tar.gz"
Download-File -Url $supabaseUrl -Destination $supabaseArchive
if (Test-Path $supabaseDir) {
  Remove-Item -Recurse -Force $supabaseDir
}
New-Item -ItemType Directory -Force -Path $supabaseDir | Out-Null
tar -xzf $supabaseArchive -C $supabaseDir

$ghExe = Join-Path $ghDir "bin\gh.exe"
$supabaseExe = Join-Path $supabaseDir "supabase.exe"

if (-not (Test-Path $ghExe)) {
  throw "Falha ao instalar gh em $ghExe."
}

if (-not (Test-Path $supabaseExe)) {
  throw "Falha ao instalar supabase em $supabaseExe."
}

Write-Host ""
Write-Host "Ferramentas instaladas:"
Write-Host "gh:       $(& $ghExe --version | Select-Object -First 1)"
Write-Host "supabase: $(& $supabaseExe --version)"
Write-Host ""
Write-Host "Executaveis locais:"
Write-Host $ghExe
Write-Host $supabaseExe
