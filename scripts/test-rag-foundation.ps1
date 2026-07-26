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

. (Join-Path $PSScriptRoot "lib/PreviewIdentity.ps1")
. (Join-Path $PSScriptRoot "lib/ProcessArguments.ps1")

$uri = [System.Uri]$DatabaseUrl
# Connection is rebuilt without an embedded password so no psql invocation
# below ever carries a credential in its command-line arguments; the
# password (if any) travels only through a per-process environment
# override. Never print $DatabaseUrl, $connection or $psqlEnvironment.
$connection = New-PsqlConnectionArguments -Uri $uri
$psqlEnvironment = @{}
if ($null -ne $connection.Password) {
  $psqlEnvironment["PGPASSWORD"] = $connection.Password
}

function Invoke-PsqlFile {
  param([Parameter(Mandatory = $true)][string]$RelativePath)

  $absolutePath = Join-Path $repoRoot $RelativePath
  $arguments = @("--no-psqlrc", "--set=ON_ERROR_STOP=1") + $connection.Arguments + @("--file=$absolutePath")
  $exitCode = Invoke-ManagedProcess -FilePath "psql" -ArgumentList $arguments `
    -EnvironmentOverrides $psqlEnvironment
  if ($exitCode -ne 0) {
    throw "RAG test step failed: $RelativePath"
  }
}

function Assert-DisposableTarget {
  if ($DatabaseUrl -match [regex]::Escape($productionProjectRef) `
      -or $PreviewBranchName -eq $productionProjectRef) {
    throw "Refusing RAG database tests: production project is prohibited."
  }

  if ($TargetMode -eq "Local") {
    $urlDatabaseName = [System.Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart("/"))
    if (-not (Test-LocalLoopbackHost -Uri $uri) -or $urlDatabaseName -notmatch "_rag_preview_test$") {
      throw "Refusing local RAG tests: require loopback host (localhost, 127.0.0.1 or ::1) and _rag_preview_test database."
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

    # Every identity extractable from the connection URL (host, username,
    # or both) must agree with the verified branch metadata -- replaces
    # the previous "hostMatches -or usernameMatches" logic, which accepted
    # a connection whose host and username named two DIFFERENT projects as
    # long as either one happened to match. See scripts/lib/PreviewIdentity.ps1.
    $decodedUser = [System.Uri]::UnescapeDataString(($uri.UserInfo -split ":", 2)[0])
    $identity = Test-PreviewConnectionIdentity -HostName $uri.Host -UserName $decodedUser `
      -VerifiedProjectRef ([string]$branch.project_ref) -ProductionProjectRef $productionProjectRef
    if (-not $identity.IsValid) {
      throw "Refusing Preview RAG tests: $($identity.Reason)"
    }

    Write-Output "Verified disposable Preview branch: $($branch.name) [$([string]$branch.project_ref)]"
  }

  $probe = Invoke-ManagedProcessCapture -FilePath "psql" -EnvironmentOverrides $psqlEnvironment -ArgumentList (
    @("--no-psqlrc", "--tuples-only", "--no-align", "--set=ON_ERROR_STOP=1") + $connection.Arguments +
    @("--command=select current_database()")
  )
  if ($probe.ExitCode -ne 0) {
    throw "Refusing RAG database tests: target identity query failed."
  }
  $databaseName = $probe.StdOut.Trim()
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
    $arguments = @(
      "--no-psqlrc", "--set=ON_ERROR_STOP=1", "--set=VERBOSITY=verbose",
      "--set=barrier_id=$barrierId"
    ) + $connection.Arguments + @("--file=$SqlFile")
    # psql fully buffers stdout by default once it isn't a terminal (i.e.
    # always, here, since it's redirected to a file for barrier polling),
    # so \echo LOCK_ACQUIRED can sit in that buffer well past when the
    # polling loop below needs to see it. stdbuf -oL forces line
    # buffering so the marker is flushed to disk as soon as it's
    # printed. Windows has no stdbuf; on Windows PowerShell's own
    # Start-Process-based redirection has not shown this problem, so the
    # wrapper is applied only where it is both available and needed.
    if ($env:OS -eq "Windows_NT") {
      return Start-ManagedProcessToFiles -FilePath "psql" -ArgumentList $arguments `
        -StandardOutputPath $stdoutPath -StandardErrorPath $stderrPath `
        -EnvironmentOverrides $psqlEnvironment
    }
    else {
      $stdbufArguments = @("-oL", "--", "psql") + $arguments
      return Start-ManagedProcessToFiles -FilePath "stdbuf" -ArgumentList $stdbufArguments `
        -StandardOutputPath $stdoutPath -StandardErrorPath $stderrPath `
        -EnvironmentOverrides $psqlEnvironment
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
        Stop-ManagedProcessToFiles -Handle $session
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

$reapply = Invoke-ManagedProcessCapture -FilePath "psql" -EnvironmentOverrides $psqlEnvironment -ArgumentList (
  @("--no-psqlrc", "--set=ON_ERROR_STOP=1") + $connection.Arguments +
  @("--file=$(Join-Path $repoRoot "supabase/migrations/202607250001_rag_foundation_v2.sql")")
)
if ($reapply.ExitCode -eq 0) {
  throw "Expected migration re-execution to fail fast, but it succeeded."
}

Invoke-ConcurrencyTest
Write-Output "RAG migration, tenant-security and two-connection concurrency harness passed."
