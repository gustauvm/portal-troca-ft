param(
  [string]$ProjectRef,
  [string]$ProjectName = "troca-de-folga-portal",
  [string]$OrgId,
  [string]$Region = "sa-east-1",
  [string]$Size,
  [string]$DbPassword,
  [string]$NextiClientId,
  [string]$NextiClientSecret,
  [string]$NextiApiBaseUrl = "https://api.nexti.com",
  [string]$NextiGroupConfigJson,
  [ValidateSet("none", "schedule_transfer", "replacement")]
  [string]$NextiReconciliationSource = "schedule_transfer",
  [switch]$SkipDbPush,
  [switch]$SkipFunctions
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$supabaseExe = Join-Path $root ".tools\supabase\supabase.exe"

if (-not (Test-Path $supabaseExe)) {
  throw "supabase nao encontrado. Rode scripts/install-tools.ps1 primeiro."
}

if (-not $DbPassword) {
  throw "DbPassword e obrigatoria para criar ou vincular o projeto."
}

if (-not $NextiClientId) {
  throw "NextiClientId e obrigatorio."
}

if (-not $NextiClientSecret) {
  throw "NextiClientSecret e obrigatorio."
}

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

function Get-PropertyValue {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Object,
    [Parameter(Mandatory = $true)]
    [string[]]$Names
  )

  foreach ($name in $Names) {
    $property = $Object.PSObject.Properties[$name]
    if ($property -and $property.Value) {
      return [string]$property.Value
    }
  }

  return $null
}

function Get-JsonResult {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Args
  )

  $output = Get-NativeOutput -FilePath $supabaseExe -Arguments ($Args + @("--output", "json"))
  if (-not $output) {
    return $null
  }

  return $output | ConvertFrom-Json
}

function Get-ProjectList {
  return Get-JsonResult -Args @("projects", "list")
}

function Get-ProjectRefFromItem {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Project
  )

  return Get-PropertyValue -Object $Project -Names @("project_ref", "ref", "id")
}

function Get-ProjectByName {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  $projects = @(Get-ProjectList)
  if (-not $projects) {
    return $null
  }

  return $projects | Where-Object { (Get-PropertyValue -Object $_ -Names @("name")) -eq $Name } | Select-Object -Last 1
}

function Wait-ForProjectToAppear {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    $project = Get-ProjectByName -Name $Name
    if ($project) {
      return $project
    }

    Start-Sleep -Seconds 15
  }

  throw "Projeto '$Name' nao apareceu na lista remota no tempo esperado."
}

function Wait-ForProjectReady {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Ref
  )

  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    $projects = @(Get-ProjectList)
    $project = $projects | Where-Object { (Get-ProjectRefFromItem -Project $_) -eq $Ref } | Select-Object -First 1
    if ($project) {
      $status = (Get-PropertyValue -Object $project -Names @("status", "health", "state"))
      if (-not $status -or $status.ToLowerInvariant() -match "active|healthy|ready") {
        return
      }
    }

    Start-Sleep -Seconds 15
  }

  throw "Projeto $Ref ainda nao ficou pronto no tempo esperado."
}

function Get-DefaultGroupConfigJson {
  return '{"bombeiros":{"companyName":"DUNAMIS SERVICOS BOMBEIROS"},"servicos":{"companyName":"DUNAMIS - SERVICOS EMPRESARIAIS TERCEIRIZADOS LTDA"},"seguranca":{"companyName":"DUNAMIS SEGURANCA E VIGILANCIA LTDA"},"rbfacilities":{"companyName":"RB FACILITIES LTDA"}}'
}

$null = Get-ProjectList

if (-not $ProjectRef) {
  if (-not $OrgId) {
    $orgs = @(Get-JsonResult -Args @("orgs", "list"))
    if ($orgs.Count -eq 1) {
      $OrgId = Get-PropertyValue -Object $orgs[0] -Names @("id", "slug", "organization_id")
    } else {
      throw "Mais de uma organizacao encontrada. Informe -OrgId."
    }
  }

  $createArgs = @("projects", "create", $ProjectName, "--org-id", $OrgId, "--db-password", $DbPassword, "--region", $Region)
  if ($Size) {
    $createArgs += @("--size", $Size)
  }

  Invoke-Native -FilePath $supabaseExe -Arguments $createArgs
  $project = Wait-ForProjectToAppear -Name $ProjectName
  $ProjectRef = Get-ProjectRefFromItem -Project $project
}

Wait-ForProjectReady -Ref $ProjectRef

Push-Location $root
try {
  Invoke-Native -FilePath $supabaseExe -Arguments @("link", "--project-ref", $ProjectRef, "--password", $DbPassword)

  if (-not $SkipDbPush) {
    Invoke-Native -FilePath $supabaseExe -Arguments @("db", "push", "--linked", "--password", $DbPassword, "--include-all")
  }

  $apiKeys = @(Get-JsonResult -Args @("projects", "api-keys", "--project-ref", $ProjectRef))
  $anonKey = $null
  $serviceRoleKey = $null

  foreach ($key in $apiKeys) {
    $name = (Get-PropertyValue -Object $key -Names @("name", "type", "description"))
    $value = Get-PropertyValue -Object $key -Names @("api_key", "key", "value")
    if ($name -and $value) {
      if ($name.ToLowerInvariant() -match "anon") {
        $anonKey = $value
      }
      if ($name.ToLowerInvariant() -match "service[_ -]?role") {
        $serviceRoleKey = $value
      }
    }
  }

  if (-not $serviceRoleKey) {
    throw "Nao foi possivel obter a service role key do projeto."
  }

  $projectUrl = "https://$ProjectRef.supabase.co"
  if (-not $NextiGroupConfigJson) {
    $NextiGroupConfigJson = Get-DefaultGroupConfigJson
  }

  $envFile = Join-Path $root ".temp.supabase-secrets.env"
  @(
    "NEXTI_CLIENT_ID=$NextiClientId"
    "NEXTI_CLIENT_SECRET=$NextiClientSecret"
    "NEXTI_API_BASE_URL=$NextiApiBaseUrl"
    "NEXTI_GROUP_CONFIG_JSON=$NextiGroupConfigJson"
    "NEXTI_RECONCILIATION_SOURCE=$NextiReconciliationSource"
    "SUPABASE_URL=$projectUrl"
    "SUPABASE_SERVICE_ROLE_KEY=$serviceRoleKey"
  ) | Set-Content -Path $envFile -Encoding utf8

  try {
    Invoke-Native -FilePath $supabaseExe -Arguments @("secrets", "set", "--project-ref", $ProjectRef, "--env-file", $envFile)
  } finally {
    if (Test-Path $envFile) {
      Remove-Item -Force $envFile
    }
  }

  if (-not $SkipFunctions) {
    $publicFunctions = @("nexti-directory", "troca-request")
    $internalFunctions = @("troca-history", "troca-queue", "troca-reconcile", "troca-review")

    foreach ($functionName in $publicFunctions) {
      Invoke-Native -FilePath $supabaseExe -Arguments @("functions", "deploy", $functionName, "--project-ref", $ProjectRef, "--use-api", "--no-verify-jwt")
    }

    foreach ($functionName in $internalFunctions) {
      Invoke-Native -FilePath $supabaseExe -Arguments @("functions", "deploy", $functionName, "--project-ref", $ProjectRef, "--use-api")
    }
  }

  Write-Host ""
  Write-Host "Supabase pronto:"
  Write-Host "Project ref: $ProjectRef"
  Write-Host "Project URL: $projectUrl"
  if ($anonKey) {
    Write-Host "Anon key: $anonKey"
  }
} finally {
  Pop-Location
}
