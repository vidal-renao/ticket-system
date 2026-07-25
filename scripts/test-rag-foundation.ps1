param(
  [Parameter(Mandatory = $true)]
  [string]$DatabaseUrl
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$databaseName = (& psql --dbname=$DatabaseUrl --tuples-only --no-align --command="select current_database()" 2>$null).Trim()

if ($LASTEXITCODE -ne 0 -or $databaseName -notmatch "_rag_preview_test$") {
  throw "Refusing RAG database tests: database name must end with _rag_preview_test."
}

$files = @(
  "supabase/tests/fixtures/rag_legacy_base.sql",
  "supabase/migrations/202607250001_rag_foundation_v2.sql",
  "supabase/migrations/202607250002_rag_retrieval_grants.sql",
  "supabase/tests/rag_foundation.sql"
)

foreach ($relativePath in $files) {
  $absolutePath = Join-Path $repoRoot $relativePath
  & psql --dbname=$DatabaseUrl --set=ON_ERROR_STOP=1 --file=$absolutePath
  if ($LASTEXITCODE -ne 0) {
    throw "RAG test step failed: $relativePath"
  }
}

& psql --dbname=$DatabaseUrl --set=ON_ERROR_STOP=1 `
  --file=(Join-Path $repoRoot "supabase/migrations/202607250001_rag_foundation_v2.sql") 2>$null
if ($LASTEXITCODE -eq 0) {
  throw "Expected migration re-execution to fail fast, but it succeeded."
}

Write-Output "RAG migration and tenant-security harness passed."

