# Safe external-process argument construction for Windows PowerShell 5.1.
#
# ProcessStartInfo.ArgumentList (which adds each argument independently,
# with no manual quoting) is a .NET Core-only API and is NOT available on
# .NET Framework 4.x, which is what Windows PowerShell 5.1 runs on --
# confirmed in this environment: [System.Diagnostics.ProcessStartInfo] has
# no ArgumentList property here.
#
# The actual bug this closes: Start-Process -ArgumentList <string[]> joins
# the array with plain spaces internally and re-parses that through the OS
# command-line parser, so any unquoted element containing a space (e.g. a
# --file path under a directory named "VIDAL ECOSYSTEM", which is this
# repository's real parent folder) silently splits into two argv entries.
# Start-Process -ArgumentList <single pre-quoted string>, by contrast, is
# passed straight through to ProcessStartInfo.Arguments with no internal
# joining -- verified empirically in this environment (see
# scripts/tests/test-process-arguments.ps1). ConvertTo-Win32QuotedArgument
# ports .NET's own internal escaping algorithm (PasteArguments.AppendArgument,
# the same one ArgumentList.Add uses on platforms where it exists) so the
# hand-built string round-trips through Win32 CreateProcess exactly as
# ArgumentList would have produced it.

function Test-ArgumentNeedsQuoting {
  param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Value)
  if ($Value.Length -eq 0) { return $true }
  foreach ($ch in $Value.ToCharArray()) {
    if ([char]::IsWhiteSpace($ch) -or $ch -eq '"') { return $true }
  }
  return $false
}

function ConvertTo-Win32QuotedArgument {
  param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Value)

  if (-not (Test-ArgumentNeedsQuoting $Value)) {
    return $Value
  }

  $sb = [System.Text.StringBuilder]::new()
  [void]$sb.Append('"')
  $i = 0
  $length = $Value.Length
  while ($i -lt $length) {
    $c = $Value[$i]
    if ($c -eq '\') {
      $numBackslash = 1
      $i++
      while ($i -lt $length -and $Value[$i] -eq '\') {
        $numBackslash++
        $i++
      }
      if ($i -eq $length) {
        [void]$sb.Append(('\' * ($numBackslash * 2)))
      }
      elseif ($Value[$i] -eq '"') {
        [void]$sb.Append(('\' * ($numBackslash * 2 + 1)))
        [void]$sb.Append('"')
        $i++
      }
      else {
        [void]$sb.Append(('\' * $numBackslash))
      }
    }
    elseif ($c -eq '"') {
      [void]$sb.Append('\"')
      $i++
    }
    else {
      [void]$sb.Append($c)
      $i++
    }
  }
  [void]$sb.Append('"')
  return $sb.ToString()
}

function New-ProcessArguments {
  <#
    Joins a full argument list into the single command-line string
    Start-Process/ProcessStartInfo need, quoting each element
    independently so no argument is ever re-split -- functionally
    equivalent to what ArgumentList.Add(...) per-argument would have
    produced, and safe to pass to Start-Process -ArgumentList as ONE
    string (never as an array; see header comment).
  #>
  param([Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$ArgumentList)
  $quoted = foreach ($arg in $ArgumentList) { ConvertTo-Win32QuotedArgument $arg }
  return ($quoted -join ' ')
}

function Set-ManagedProcessEnvironment {
  <#
    Applies environment overrides (e.g. PGPASSWORD) to this PowerShell
    process only, for the short window around a single Start-Process call.
    A freshly spawned child snapshots its parent's environment at creation
    time, so restoring immediately afterwards (Restore-ManagedProcessEnvironment)
    never affects the already-launched child, even for the non-blocking
    (async) launch path.
  #>
  param([hashtable]$EnvironmentOverrides)
  $previous = @{}
  if ($EnvironmentOverrides) {
    foreach ($key in $EnvironmentOverrides.Keys) {
      $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
      [Environment]::SetEnvironmentVariable($key, $EnvironmentOverrides[$key], 'Process')
    }
  }
  return $previous
}

function Restore-ManagedProcessEnvironment {
  param([Parameter(Mandatory = $true)][AllowNull()][hashtable]$PreviousValues)
  if (-not $PreviousValues) { return }
  foreach ($key in $PreviousValues.Keys) {
    [Environment]::SetEnvironmentVariable($key, $PreviousValues[$key], 'Process')
  }
}

function Invoke-ManagedProcess {
  <#
    Runs FilePath to completion with the console inherited (interactive
    psql output stays visible) and returns its exit code. UseShellExecute
    is implicitly false for -NoNewWindow, so there is no shell
    interpolation of any argument.
  #>
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$ArgumentList,
    [hashtable]$EnvironmentOverrides
  )
  $argumentString = New-ProcessArguments -ArgumentList $ArgumentList
  $previous = Set-ManagedProcessEnvironment -EnvironmentOverrides $EnvironmentOverrides
  try {
    $process = Start-Process -FilePath $FilePath -ArgumentList $argumentString `
      -NoNewWindow -Wait -PassThru
    return $process.ExitCode
  }
  finally {
    Restore-ManagedProcessEnvironment -PreviousValues $previous
  }
}

function Invoke-ManagedProcessCapture {
  <#
    Runs FilePath to completion with stdout/stderr redirected to disposable
    temp files by Start-Process's own OS-level redirection (the same
    mechanism proven deadlock-free for the two-session concurrency case
    below), then reads them back into memory and deletes them.
  #>
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$ArgumentList,
    [hashtable]$EnvironmentOverrides
  )
  $argumentString = New-ProcessArguments -ArgumentList $ArgumentList
  $stdoutPath = [System.IO.Path]::GetTempFileName()
  $stderrPath = [System.IO.Path]::GetTempFileName()
  $previous = Set-ManagedProcessEnvironment -EnvironmentOverrides $EnvironmentOverrides
  try {
    $process = Start-Process -FilePath $FilePath -ArgumentList $argumentString `
      -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath `
      -NoNewWindow -Wait -PassThru
    $stdout = if (Test-Path -LiteralPath $stdoutPath) { Get-Content -LiteralPath $stdoutPath -Raw } else { '' }
    $stderr = if (Test-Path -LiteralPath $stderrPath) { Get-Content -LiteralPath $stderrPath -Raw } else { '' }
    return [PSCustomObject]@{
      ExitCode = $process.ExitCode
      StdOut   = if ($null -eq $stdout) { '' } else { $stdout }
      StdErr   = if ($null -eq $stderr) { '' } else { $stderr }
    }
  }
  finally {
    Restore-ManagedProcessEnvironment -PreviousValues $previous
    Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
  }
}

function Start-ManagedProcessToFiles {
  <#
    Launches FilePath asynchronously (does not wait) with stdout/stderr
    redirected straight to the given files by Start-Process, so a caller
    can poll the stdout file for a barrier marker while the process is
    still running. Returns a handle for Stop-ManagedProcessToFiles.
  #>
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$ArgumentList,
    [Parameter(Mandatory = $true)][string]$StandardOutputPath,
    [Parameter(Mandatory = $true)][string]$StandardErrorPath,
    [hashtable]$EnvironmentOverrides
  )
  $argumentString = New-ProcessArguments -ArgumentList $ArgumentList
  $previous = Set-ManagedProcessEnvironment -EnvironmentOverrides $EnvironmentOverrides
  try {
    $process = Start-Process -FilePath $FilePath -ArgumentList $argumentString `
      -RedirectStandardOutput $StandardOutputPath -RedirectStandardError $StandardErrorPath `
      -NoNewWindow -PassThru
  }
  finally {
    Restore-ManagedProcessEnvironment -PreviousValues $previous
  }
  return [PSCustomObject]@{
    Process    = $process
    StdoutPath = $StandardOutputPath
    StderrPath = $StandardErrorPath
  }
}

function Stop-ManagedProcessToFiles {
  param([Parameter(Mandatory = $true)]$Handle)
  if (-not $Handle.Process.HasExited) {
    try { $Handle.Process.Kill($true) } catch {}
  }
}

function New-PsqlConnectionArguments {
  <#
    Rebuilds psql connection flags without an embedded password so
    credentials never appear in the child process's command line (visible
    to any local user via Get-Process/Task Manager, unlike an environment
    variable scoped to this one process). The password, when present, is
    returned separately for the caller to pass through PGPASSWORD.
  #>
  param([Parameter(Mandatory = $true)][System.Uri]$Uri)

  $userInfoParts = $Uri.UserInfo -split ':', 2
  $decodedUser = [System.Uri]::UnescapeDataString($userInfoParts[0])
  $decodedPassword = if ($userInfoParts.Length -gt 1) {
    [System.Uri]::UnescapeDataString($userInfoParts[1])
  }
  else { $null }
  $databaseName = [System.Uri]::UnescapeDataString($Uri.AbsolutePath.TrimStart('/'))

  $arguments = @("--host=$($Uri.Host)")
  if ($Uri.Port -ne -1) {
    $arguments += "--port=$($Uri.Port)"
  }
  $arguments += "--username=$decodedUser"
  $arguments += "--dbname=$databaseName"
  return [PSCustomObject]@{ Arguments = $arguments; Password = $decodedPassword }
}
