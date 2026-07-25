param(
  [Parameter(Mandatory = $true)]
  [string]$DatabaseUrl,

  [Parameter(Mandatory = $true)]
  [ValidateSet("Local", "SupabasePreview")]
  [string]$TargetMode,

  [string]$PreviewBranchName
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
      -or $PreviewBranchName -eq $productionProjectRef) {
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
    if ([string]::IsNullOrWhiteSpace($PreviewBranchName)) {
      throw "Refusing Preview RAG tests: a branch name is required for metadata lookup."
    }

    $metadataJson = & supabase branches get $PreviewBranchName `
      --project-ref $productionProjectRef --output json 2>$null
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace(($metadataJson -join ""))) {
      throw "Refusing Preview RAG tests: official branch metadata lookup failed."
    }
    try {
      $branch = ($metadataJson -join "`n") | ConvertFrom-Json -ErrorAction Stop
    }
    catch {
      throw "Refusing Preview RAG tests: branch metadata is not valid JSON."
    }

    $requiredFields = @(
      "name", "project_ref", "parent_project_ref", "is_default",
      "persistent", "status", "preview_project_status"
    )
    foreach ($field in $requiredFields) {
      if ($null -eq $branch.PSObject.Properties[$field]) {
        throw "Refusing Preview RAG tests: branch metadata schema is incomplete."
      }
    }

    $readyBranchStatuses = @("MIGRATIONS_PASSED", "FUNCTIONS_DEPLOYED")
    if ($branch.name -ne $PreviewBranchName `
        -or $branch.parent_project_ref -ne $productionProjectRef `
        -or $branch.project_ref -eq $productionProjectRef `
        -or $branch.project_ref -notmatch "^[a-z0-9]{20}$" `
        -or $branch.is_default -ne $false `
        -or $branch.persistent -ne $false `
        -or $branch.status -notin $readyBranchStatuses `
        -or $branch.preview_project_status -ne "ACTIVE_HEALTHY") {
      throw "Refusing Preview RAG tests: branch is not a healthy disposable Preview."
    }

    $verifiedProjectRef = [string]$branch.project_ref
    $decodedUser = [System.Uri]::UnescapeDataString(($uri.UserInfo -split ":", 2)[0])
    $hostLabels = $uri.Host -split "\."
    $userProjectRef = ($decodedUser -split "\.")[-1]
    $identityMatches = $verifiedProjectRef -in $hostLabels `
      -or $userProjectRef -eq $verifiedProjectRef
    if (-not $identityMatches) {
      throw "Refusing Preview RAG tests: connection identity does not match branch metadata."
    }

    Write-Output "Verified disposable Preview branch: $($branch.name) [$verifiedProjectRef]"
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

function Invoke-ConcurrencyIteration {
  param([Parameter(Mandatory = $true)][int]$Iteration)

  Invoke-PsqlFile "supabase/tests/rag_sanitization_concurrency_setup.sql"

  $sessionAPath = Join-Path $repoRoot "supabase/tests/rag_sanitization_concurrency_session_a.sql"
  $sessionBPath = Join-Path $repoRoot "supabase/tests/rag_sanitization_concurrency_session_b.sql"
  $barrierId = "$([guid]::NewGuid().ToString('N'))-$Iteration"
  $tempRoot = [System.IO.Path]::GetTempPath()

  function Start-PsqlSession {
    param(
      [Parameter(Mandatory = $true)][string]$Name,
      [Parameter(Mandatory = $true)][string]$SqlFile
    )

    $stdoutPath = Join-Path $tempRoot "rag-$barrierId-$Name.stdout"
    $stderrPath = Join-Path $tempRoot "rag-$barrierId-$Name.stderr"
    $process = Start-Process -FilePath "psql" -ArgumentList @(
      "--dbname=$DatabaseUrl",
      "--set=ON_ERROR_STOP=1",
      "--set=VERBOSITY=verbose",
      "--set=barrier_id=$barrierId",
      "--file=$SqlFile"
    ) -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath `
      -WindowStyle Hidden -PassThru
    return [PSCustomObject]@{
      Process = $process
      StdoutPath = $stdoutPath
      StderrPath = $stderrPath
    }
  }

  $sessionA = $null
  $sessionB = $null
  try {
    $sessionA = Start-PsqlSession -Name "a" -SqlFile $sessionAPath
    $marker = "LOCK_ACQUIRED $barrierId"
    $markerDeadline = [DateTime]::UtcNow.AddSeconds(10)
    $markerObserved = $false
    while ([DateTime]::UtcNow -lt $markerDeadline -and -not $markerObserved) {
      if (Test-Path -LiteralPath $sessionA.StdoutPath) {
        $markerObserved = (Get-Content -LiteralPath $sessionA.StdoutPath -Raw) -match `
          [regex]::Escape($marker)
      }
      if ($sessionA.Process.HasExited -and -not $markerObserved) {
        break
      }
      if (-not $markerObserved) {
        Start-Sleep -Milliseconds 50
      }
    }
    if (-not $markerObserved) {
      throw "RAG concurrency barrier was not observed."
    }

    $sessionB = Start-PsqlSession -Name "b" -SqlFile $sessionBPath
    foreach ($session in @($sessionA, $sessionB)) {
      if (-not $session.Process.WaitForExit(30000)) {
        $session.Process.Kill($true)
        throw "RAG concurrency session exceeded its process timeout."
      }

      $stdout = if (Test-Path -LiteralPath $session.StdoutPath) {
        Get-Content -LiteralPath $session.StdoutPath -Raw
      } else { "" }
      $stderr = if (Test-Path -LiteralPath $session.StderrPath) {
        Get-Content -LiteralPath $session.StderrPath -Raw
      } else { "" }
      $combinedOutput = "$stdout`n$stderr"
      if ($combinedOutput -match "\b(40P01|55P03|57014)\b") {
        throw "RAG concurrency test detected PostgreSQL lock SQLSTATE."
      }
      if ($session.Process.ExitCode -ne 0) {
        throw "RAG concurrency session failed."
      }
    }

    Invoke-PsqlFile "supabase/tests/rag_sanitization_concurrency_assert.sql"
  }
  finally {
    foreach ($session in @($sessionA, $sessionB)) {
      if ($null -ne $session) {
        if (-not $session.Process.HasExited) {
          $session.Process.Kill($true)
        }
        Remove-Item -LiteralPath $session.StdoutPath -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $session.StderrPath -Force -ErrorAction SilentlyContinue
      }
    }
    Invoke-PsqlFile "supabase/tests/rag_sanitization_concurrency_cleanup.sql"
  }
}

function Invoke-ConcurrencyTest {
  foreach ($iteration in 1..3) {
    Invoke-ConcurrencyIteration -Iteration $iteration
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
