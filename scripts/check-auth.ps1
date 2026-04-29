Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ghExe = Join-Path $root ".tools\gh\bin\gh.exe"
$supabaseExe = Join-Path $root ".tools\supabase\supabase.exe"
$failed = $false

function Test-NativeCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,
    [string[]]$Arguments = @()
  )

  $stdoutPath = [System.IO.Path]::GetTempFileName()
  $stderrPath = [System.IO.Path]::GetTempFileName()
  try {
    $process = Start-Process -FilePath $FilePath -ArgumentList $Arguments -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -NoNewWindow -PassThru -Wait
    return $process.ExitCode -eq 0
  } finally {
    Remove-Item -Force $stdoutPath, $stderrPath -ErrorAction SilentlyContinue
  }
}

if (-not (Test-Path $ghExe)) {
  Write-Host "gh nao encontrado em $ghExe"
  $failed = $true
} else {
  if (Test-NativeCommand -FilePath $ghExe -Arguments @("auth", "status")) {
    Write-Host "GitHub autenticado."
  } else {
    Write-Host "GitHub nao autenticado. Rode: .\.tools\gh\bin\gh.exe auth login"
    $failed = $true
  }
}

Write-Host ""

if (-not (Test-Path $supabaseExe)) {
  Write-Host "supabase nao encontrado em $supabaseExe"
  $failed = $true
} else {
  if (Test-NativeCommand -FilePath $supabaseExe -Arguments @("orgs", "list", "--output", "json")) {
    Write-Host "Supabase autenticado."
  } else {
    Write-Host "Supabase nao autenticado. Rode: .\.tools\supabase\supabase.exe login"
    $failed = $true
  }
}

if ($failed) {
  exit 1
}
