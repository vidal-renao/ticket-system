param(
  [Parameter(Mandatory = $true)]
  [string]$DatabaseUrl,

  [Parameter(Mandatory = $true)]
  [ValidateSet("Local", "SupabasePreview")]
  [string]$TargetMode,

  [string]$VerifiedProjectRef
)

$ErrorActionPreference = "Stop"
$productionProjectRef = "focgfmhgfmhmcbywwsej"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

function Invoke-PsqlFile {
  param([Parameter(Mandatory = $true)][string]$RelativePath)

  $absolutePath = Join-Path $repoRoot $RelativePath
  & psql --dbname=$DatabaseUrl --set=ON_ERROR_STOP=1 --file=$absolutePath
  if ($LASTEXITCODE -ne 0) {
    throw "RAG test step failed: $RelativePath"
  }
}

function Assert-DisposableTarget {
  $uri = [System.Uri]$DatabaseUrl
  if ($DatabaseUrl -match [regex]::Escape($productionProjectRef) `
      -or $VerifiedProjectRef -eq $productionProjectRef) {
    throw "Refusing RAG database tests: production project is prohibited."
  }

  if ($TargetMode -eq "Local") {
    $localHosts = @("localhost", "127.0.0.1", "::1")
    $urlDatabaseName = $uri.AbsolutePath.TrimStart("/")
    if ($uri.Host -notin $localHosts -or $urlDatabaseName -notmatch "_rag_preview_test$") {
      throw "Refusing local RAG tests: require loopback host and _rag_preview_test database."
    }
  }
  else {
    if ([string]::IsNullOrWhiteSpace($VerifiedProjectRef) `
        -or $VerifiedProjectRef -notmatch "^[a-z0-9]{20}$") {
      throw "Refusing Preview RAG tests: an independently verified project ref is required."
    }

    $decodedUser = [System.Uri]::UnescapeDataString(($uri.UserInfo -split ":", 2)[0])
    $identityMatches = $uri.Host -like "*$VerifiedProjectRef*" `
      -or $decodedUser -eq "postgres.$VerifiedProjectRef" `
      -or $decodedUser -like "*.$VerifiedProjectRef"
    if (-not $identityMatches) {
      throw "Refusing Preview RAG tests: connection identity does not match verified project ref."
    }
  }

  $databaseName = (& psql --dbname=$DatabaseUrl --tuples-only --no-align `
    --set=ON_ERROR_STOP=1 --command="select current_database()" 2>$null).Trim()
  if ($LASTEXITCODE -ne 0) {
    throw "Refusing RAG database tests: target identity query failed."
  }
  if ($TargetMode -eq "Local" -and $databaseName -notmatch "_rag_preview_test$") {
    throw "Refusing local RAG tests: connected database identity is not disposable."
  }
}

function Invoke-ConcurrencyTest {
  Invoke-PsqlFile "supabase/tests/rag_sanitization_concurrency_setup.sql"

  $sessionAPath = Join-Path $repoRoot "supabase/tests/rag_sanitization_concurrency_session_a.sql"
  $sessionBPath = Join-Path $repoRoot "supabase/tests/rag_sanitization_concurrency_session_b.sql"
  $jobScript = {
    param($Connection, $SqlFile)
    $output = & psql --dbname=$Connection --set=ON_ERROR_STOP=1 --file=$SqlFile 2>&1
    [PSCustomObject]@{
      ExitCode = $LASTEXITCODE
      Output = ($output -join "`n")
    }
  }

  $sessionA = Start-Job -ScriptBlock $jobScript -ArgumentList $DatabaseUrl, $sessionAPath
  Start-Sleep -Milliseconds 300
  $sessionB = Start-Job -ScriptBlock $jobScript -ArgumentList $DatabaseUrl, $sessionBPath
  $jobs = @($sessionA, $sessionB)

  try {
    $null = Wait-Job -Job $jobs -Timeout 30
    if ($jobs.State -contains "Running") {
      Stop-Job -Job $jobs
      throw "RAG concurrency test exceeded its orchestration timeout."
    }

    $results = @($jobs | Receive-Job)
    foreach ($result in $results) {
      if ($result.ExitCode -ne 0) {
        if ($result.Output -match "deadlock detected") {
          throw "RAG concurrency test detected a deadlock."
        }
        if ($result.Output -match "statement timeout|canceling statement") {
          throw "RAG concurrency test detected a database timeout."
        }
        throw "RAG concurrency session failed."
      }
      if ($result.Output -match "deadlock detected|statement timeout|canceling statement") {
        throw "RAG concurrency test returned an unexpected lock error."
      }
    }

    Invoke-PsqlFile "supabase/tests/rag_sanitization_concurrency_assert.sql"
  }
  finally {
    Remove-Job -Job $jobs -Force -ErrorAction SilentlyContinue
    Invoke-PsqlFile "supabase/tests/rag_sanitization_concurrency_cleanup.sql"
  }
}

Assert-DisposableTarget

$files = @()
if ($TargetMode -eq "Local") {
  $files += "supabase/tests/fixtures/rag_legacy_base.sql"
}
else {
  $files += "supabase/tests/fixtures/rag_preview_test_prerequisites.sql"
}
$files += @(
  "supabase/migrations/202607250001_rag_foundation_v2.sql",
  "supabase/migrations/202607250002_rag_retrieval_grants.sql",
  "supabase/tests/rag_foundation.sql"
)

foreach ($relativePath in $files) {
  Invoke-PsqlFile $relativePath
}

& psql --dbname=$DatabaseUrl --set=ON_ERROR_STOP=1 `
  --file=(Join-Path $repoRoot "supabase/migrations/202607250001_rag_foundation_v2.sql") 2>$null
if ($LASTEXITCODE -eq 0) {
  throw "Expected migration re-execution to fail fast, but it succeeded."
}

Invoke-ConcurrencyTest
Write-Output "RAG migration, tenant-security and two-connection concurrency harness passed."
