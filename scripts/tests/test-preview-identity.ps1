# Pure-function test matrix for Test-PreviewConnectionIdentity and
# Test-LocalLoopbackHost (scripts/lib/PreviewIdentity.ps1). No network, no
# Supabase, no psql -- these are deterministic, in-process assertions.

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $PSCommandPath
. (Join-Path $here "../lib/PreviewIdentity.ps1")

$verified = "abcdefghij1234567890"
$projectC = "cccccccccc1234567890"
$production = "focgfmhgfmhmcbywwsej"
$failures = @()

function Assert-Identity {
  param(
    [string]$Label,
    [string]$HostName,
    [string]$UserName,
    [string]$VerifiedProjectRef,
    [bool]$ExpectValid
  )
  $result = Test-PreviewConnectionIdentity -HostName $HostName -UserName $UserName `
    -VerifiedProjectRef $VerifiedProjectRef -ProductionProjectRef $production
  if ($result.IsValid -ne $ExpectValid) {
    $script:failures += "[identity] $Label -> expected IsValid=$ExpectValid, got IsValid=$($result.IsValid) ($($result.Reason))"
  }
}

function Assert-Loopback {
  param([string]$Label, [string]$Url, [bool]$ExpectLoopback)
  $uri = [System.Uri]$Url
  $actual = Test-LocalLoopbackHost -Uri $uri
  if ($actual -ne $ExpectLoopback) {
    $script:failures += "[loopback] $Label -> expected $ExpectLoopback, got $actual"
  }
}

# --- Section 5 matrix: host / username / verified ref / expected outcome ---
Assert-Identity "direct Preview host, normal username" `
  "db.$verified.supabase.co" "postgres" $verified $true
Assert-Identity "generic pooler host, Preview username" `
  "aws-0-eu-central-1.pooler.supabase.com" "postgres.$verified" $verified $true
Assert-Identity "Preview host, Preview username (both present, agree)" `
  "db.$verified.supabase.co" "postgres.$verified" $verified $true
Assert-Identity "production host, Preview username" `
  "db.$production.supabase.co" "postgres.$verified" $verified $false
Assert-Identity "Preview host, production username" `
  "db.$verified.supabase.co" "postgres.$production" $verified $false
Assert-Identity "project C host, Preview username" `
  "db.$projectC.supabase.co" "postgres.$verified" $verified $false
Assert-Identity "Preview host, project C username" `
  "db.$verified.supabase.co" "postgres.$projectC" $verified $false
Assert-Identity "no extractable ref (generic host, plain username)" `
  "aws-0-eu-central-1.pooler.supabase.com" "postgres" $verified $false
Assert-Identity "malformed verified ref" `
  "db.$verified.supabase.co" "postgres" "TOO-SHORT" $false
Assert-Identity "uppercase host normalizes to the same ref" `
  "DB.$($verified.ToUpperInvariant()).SUPABASE.CO" "postgres" $verified $true

# --- Defense-in-depth: verified ref itself must never be production ---
Assert-Identity "verified ref equals production is always rejected" `
  "db.$production.supabase.co" "postgres" $production $false

# --- Section 8: IPv6/local loopback matrix ---
Assert-Loopback "localhost" "postgresql://u:p@localhost:5432/x_rag_preview_test" $true
Assert-Loopback "127.0.0.1" "postgresql://u:p@127.0.0.1:5432/x_rag_preview_test" $true
Assert-Loopback "bracketed ::1" "postgresql://u:p@[::1]:5432/x_rag_preview_test" $true
Assert-Loopback "LAN host is rejected" "postgresql://u:p@192.168.1.5:5432/x" $false
Assert-Loopback "internet host is rejected" "postgresql://u:p@example.com:5432/x" $false
Assert-Loopback "Supabase host is rejected" "postgresql://u:p@db.$verified.supabase.co:5432/x" $false
Assert-Loopback "spoofed localhost.evil.com is rejected" "postgresql://u:p@localhost.evil.com:5432/x" $false
Assert-Loopback "spoofed 127.0.0.1.evil.com is rejected" "postgresql://u:p@127.0.0.1.evil.com:5432/x" $false

if ($failures.Count -eq 0) {
  Write-Output "PASS: Preview identity and loopback test matrix (18 assertions) all held."
}
else {
  Write-Output "FAIL:"
  $failures | ForEach-Object { Write-Output "  - $_" }
  exit 1
}
