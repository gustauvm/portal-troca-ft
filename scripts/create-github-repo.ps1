param(
  [Parameter(Mandatory = $true)]
  [string]$RepoName,
  [ValidateSet("public", "private")]
  [string]$Visibility = "public",
  [string]$Description = "Portal de trocas de folga com Nexti e Supabase",
  [string]$SupabaseProjectUrl,
  [string]$SupabaseAnonKey,
  [string]$SupabaseFunctionsBaseUrl,
  [switch]$SkipCommit
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ghExe = Join-Path $root ".tools\gh\bin\gh.exe"

function Invoke-Native {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,
    [string[]]$Arguments = @()
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao executar: $FilePath $($Arguments -join ' ')"
  }
}

function Get-NativeOutput {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,
    [string[]]$Arguments = @()
  )

  $output = & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao executar: $FilePath $($Arguments -join ' ')"
  }

  return $output
}

if (-not (Test-Path $ghExe)) {
  throw "gh nao encontrado. Rode scripts/install-tools.ps1 primeiro."
}

Invoke-Native -FilePath $ghExe -Arguments @("auth", "status")

Push-Location $root
try {
  Invoke-Native -FilePath "git" -Arguments @("branch", "-M", "main")

  if (-not $SkipCommit) {
    Invoke-Native -FilePath "git" -Arguments @("add", ".")
    $hasHead = $true
    & git rev-parse --verify HEAD *> $null
    if ($LASTEXITCODE -ne 0) {
      $hasHead = $false
    }

    if (-not $hasHead) {
      Invoke-Native -FilePath "git" -Arguments @("commit", "-m", "Initial commit")
    } else {
      $status = Get-NativeOutput -FilePath "git" -Arguments @("status", "--porcelain")
      if ($status) {
        Invoke-Native -FilePath "git" -Arguments @("commit", "-m", "Update portal setup")
      }
    }
  }

  $originExists = $true
  git remote get-url origin *> $null
  if ($LASTEXITCODE -ne 0) {
    $originExists = $false
  }

  if (-not $originExists) {
    Invoke-Native -FilePath $ghExe -Arguments @("repo", "create", $RepoName, "--$Visibility", "--description", $Description, "--source", $root, "--remote", "origin", "--push")
  } else {
    Invoke-Native -FilePath "git" -Arguments @("push", "-u", "origin", "main")
  }

  $repoFullName = (Get-NativeOutput -FilePath $ghExe -Arguments @("repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner") | Out-String).Trim()
  $repoUrl = (Get-NativeOutput -FilePath $ghExe -Arguments @("repo", "view", "--json", "url", "-q", ".url") | Out-String).Trim()

  if ($SupabaseProjectUrl) {
    Invoke-Native -FilePath $ghExe -Arguments @("variable", "set", "SUPABASE_PROJECT_URL", "--body", $SupabaseProjectUrl, "-R", $repoFullName)
  }

  if ($SupabaseAnonKey) {
    Invoke-Native -FilePath $ghExe -Arguments @("variable", "set", "SUPABASE_ANON_KEY", "--body", $SupabaseAnonKey, "-R", $repoFullName)
  }

  if (-not $SupabaseFunctionsBaseUrl -and $SupabaseProjectUrl) {
    $SupabaseFunctionsBaseUrl = "$SupabaseProjectUrl/functions/v1"
  }

  if ($SupabaseFunctionsBaseUrl) {
    Invoke-Native -FilePath $ghExe -Arguments @("variable", "set", "SUPABASE_FUNCTIONS_BASE_URL", "--body", $SupabaseFunctionsBaseUrl, "-R", $repoFullName)
  }

  Write-Host ""
  Write-Host "Repositorio pronto:"
  Write-Host $repoUrl
  Write-Host ""
  Write-Host "GitHub Pages sera publicado pelo workflow em .github/workflows/deploy-pages.yml"
} finally {
  Pop-Location
}
