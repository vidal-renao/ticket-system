# Real process-boundary test for ConvertTo-Win32QuotedArgument /
# Invoke-ManagedProcessCapture. Exercises the exact same argument
# construction (New-ProcessArguments -> Start-Process -ArgumentList
# <single pre-quoted string>) the RAG harness uses for `psql --file=<path>`,
# but launches a PowerShell child process against an inert echo script
# instead -- psql is not guaranteed available everywhere this test runs
# (e.g. before scripts/lib is exercised in CI) and this test intentionally
# never depends on it. No production, no Supabase, no network access; the
# only side effect is one temp directory, removed at the end.
#
# The child writes what it received to a result file (UTF8) instead of
# stdout, deliberately sidestepping Windows console output-encoding
# quirks that are irrelevant to the thing under test: whether the
# argument value itself survives the process boundary intact.

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $PSCommandPath
. (Join-Path $here "../lib/ProcessArguments.ps1")

$tempRoot = [System.IO.Path]::GetTempPath()
$spacedDir = Join-Path $tempRoot ("rag-arg-test " + [guid]::NewGuid().ToString('N') + " cafe test")
$failures = @()

try {
  New-Item -ItemType Directory -Path $spacedDir -Force | Out-Null

  $childScriptPath = Join-Path $spacedDir "echo args.ps1"
  $resultPath = Join-Path $spacedDir "result.txt"
  Set-Content -LiteralPath $childScriptPath -Encoding UTF8 -Value @'
param()
$resultFile = $args[0]
$received = $args[1..($args.Count - 1)]
$lines = @("COUNT=$($received.Count)") + ($received | ForEach-Object { "ARG=$_" })
Set-Content -LiteralPath $resultFile -Encoding UTF8 -Value $lines
'@

  # Unicode filename segment (built from a numeric code point, not a
  # literal source-file character, so this test's own encoding can never
  # be the thing under test) plus an embedded space in the same component
  # -- the exact shape of "supabase/tests/... .sql" once joined under this
  # repository's real "VIDAL ECOSYSTEM" parent directory.
  $accentedE = [char]0x00E9
  $targetFile = Join-Path $spacedDir "script with spaces and unicode caf${accentedE}.sql"
  Set-Content -LiteralPath $targetFile -Value "select 1;"
  $fileArgument = "--file=$targetFile"

  # "powershell.exe" only exists on Windows; PowerShell Core on Linux/macOS
  # (used by GitHub-hosted ubuntu-latest runners) ships as "pwsh" instead.
  $childExe = if ($env:OS -eq "Windows_NT") { "powershell.exe" } else { "pwsh" }
  $result = Invoke-ManagedProcessCapture -FilePath $childExe -ArgumentList @(
    "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
    "-File", $childScriptPath, $resultPath, $fileArgument
  )

  if ($result.ExitCode -ne 0) {
    $failures += "child process exited with code $($result.ExitCode): $($result.StdErr)"
  }

  if (-not (Test-Path -LiteralPath $resultPath)) {
    $failures += "child never wrote a result file"
  }
  else {
    # @(...) forces an array even when exactly one line matches -- PowerShell
    # collapses a single-item pipeline result to a bare string, and indexing
    # a string with [0] returns its first CHARACTER, not the whole element.
    $lines = @(Get-Content -LiteralPath $resultPath -Encoding UTF8 | Where-Object { $_ -ne "" })
    $countLine = $lines | Where-Object { $_ -like "COUNT=*" } | Select-Object -First 1
    $argLines = @($lines | Where-Object { $_ -like "ARG=*" })

    if ($countLine -ne "COUNT=1") {
      $failures += "expected exactly one child argument, got '$countLine' (--file path with spaces was re-split)"
    }
    $expectedArg = "ARG=$fileArgument"
    if ($argLines.Count -ne 1 -or $argLines[0] -ne $expectedArg) {
      $failures += "expected single argument '$expectedArg', got: $($argLines -join '; ')"
    }
  }

  if ($failures.Count -eq 0) {
    Write-Output "PASS: --file argument with spaces and Unicode survived the process boundary intact."
  }
  else {
    Write-Output "FAIL:"
    $failures | ForEach-Object { Write-Output "  - $_" }
    exit 1
  }
}
finally {
  if (Test-Path -LiteralPath $spacedDir) {
    Remove-Item -LiteralPath $spacedDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}
