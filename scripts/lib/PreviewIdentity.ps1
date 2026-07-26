# Pure, dot-sourceable helpers for Supabase Preview connection-identity
# verification and loopback-host detection. No I/O, no side effects, no
# reference to $DatabaseUrl or any script-scoped state -- every function
# here takes its inputs as parameters so it can be dot-sourced by both the
# harness and its test scripts and exercised in isolation.

$script:ProjectRefPattern = '^[a-z0-9]{20}$'
$script:DirectHostPattern = '^db\.([a-z0-9]{20})\.supabase\.co$'
$script:PoolerUserPattern = '^postgres\.([a-z0-9]{20})$'

function ConvertTo-ProjectRefLower {
  param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Value)
  return $Value.ToLowerInvariant()
}

function Get-HostProjectRef {
  <#
    Extracts the project ref from a direct-connection Supabase host
    (db.<ref>.supabase.co). Returns $null when the host does not follow
    that convention (e.g. a generic pooler host such as
    aws-0-eu-central-1.pooler.supabase.com) -- absence is not itself a
    mismatch, it just means this identity source contributes nothing and
    the decision falls to whatever else is extractable.
  #>
  param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$HostName)
  $match = [regex]::Match($HostName, $script:DirectHostPattern, 'IgnoreCase')
  if (-not $match.Success) { return $null }
  return ConvertTo-ProjectRefLower $match.Groups[1].Value
}

function Get-UserProjectRef {
  <#
    Extracts the project ref from a pooler-convention username
    (postgres.<ref>). Returns $null for a plain "postgres" user or any
    other username shape that does not encode a ref.
  #>
  param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$UserName)
  $match = [regex]::Match($UserName, $script:PoolerUserPattern, 'IgnoreCase')
  if (-not $match.Success) { return $null }
  return ConvertTo-ProjectRefLower $match.Groups[1].Value
}

function Test-PreviewConnectionIdentity {
  <#
    Pure decision function replacing the previous "hostMatches -or
    usernameMatches" logic. Every identity that CAN be extracted from the
    connection URL (host, username, or both) must agree with the
    officially verified branch project ref; at least one identity must be
    extractable; production is always rejected outright. Never throws --
    returns a result object so callers decide how to fail and so tests
    don't need try/catch scaffolding.
  #>
  param(
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$HostName,
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$UserName,
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$VerifiedProjectRef,
    [Parameter(Mandatory = $true)][string]$ProductionProjectRef
  )

  $verifiedLower = ConvertTo-ProjectRefLower $VerifiedProjectRef
  if ($verifiedLower -cnotmatch $script:ProjectRefPattern) {
    return [PSCustomObject]@{ IsValid = $false; Reason = 'Verified project ref is malformed.' }
  }
  if ($verifiedLower -ceq (ConvertTo-ProjectRefLower $ProductionProjectRef)) {
    return [PSCustomObject]@{ IsValid = $false; Reason = 'Verified project ref is production.' }
  }

  $hostRef = Get-HostProjectRef -HostName $HostName
  $userRef = Get-UserProjectRef -UserName $UserName

  if ($null -eq $hostRef -and $null -eq $userRef) {
    return [PSCustomObject]@{ IsValid = $false; Reason = 'No project ref could be extracted from the connection URL.' }
  }
  if ($null -ne $hostRef -and $hostRef -cne $verifiedLower) {
    return [PSCustomObject]@{ IsValid = $false; Reason = 'Host project ref does not match the verified Preview branch.' }
  }
  if ($null -ne $userRef -and $userRef -cne $verifiedLower) {
    return [PSCustomObject]@{ IsValid = $false; Reason = 'Username project ref does not match the verified Preview branch.' }
  }
  if ($null -ne $hostRef -and $null -ne $userRef -and $hostRef -cne $userRef) {
    return [PSCustomObject]@{ IsValid = $false; Reason = 'Host and username project refs contradict each other.' }
  }

  return [PSCustomObject]@{ IsValid = $true; Reason = $null }
}

function Test-LocalLoopbackHost {
  <#
    Local-mode host check. Uses System.Uri's own IsLoopback semantics
    (127.0.0.0/8, ::1 in bracketed or expanded form, or the literal string
    "localhost") instead of a fragile string allow-list that never
    actually matched a bracketed IPv6 URL (System.Uri normalizes [::1]
    into "[0000:0000:0000:0000:0000:0000:0000:0001]", which never equals
    the literal "::1"). IsLoopback is a syntactic check only -- no DNS
    resolution -- so "localhost.evil.com" and "127.0.0.1.evil.com" are
    correctly rejected, as is any LAN or internet host.
  #>
  param([Parameter(Mandatory = $true)][System.Uri]$Uri)
  return $Uri.IsLoopback
}
