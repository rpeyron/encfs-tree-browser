#Requires -Version 5.1
<#
  encfs-agent.ps1 - PowerShell twin of the Rust encfs-agent (read-only, localhost only).
  Serves the standalone app + /api/health, /api/roots, /api/list on 127.0.0.1:8765-8785.

  Distribute: this script + encfs-browser.html (optionally encfs-browser.html.gz) —
  the favicon is embedded in this file, nothing else to copy.
  or keep encfs-tree-browser/dist-standalone next to it.
  Run hidden: powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File encfs-agent.ps1
#>
param(
  [int]$StartPort = 8765,
  [string]$HtmlPath
)

$ErrorActionPreference = 'Stop'

$htmlFile = @(
  $HtmlPath
  (Join-Path $PSScriptRoot 'encfs-browser.html')
  (Join-Path $PSScriptRoot '..\dist-standalone\encfs-browser.html')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if (-not $htmlFile) { throw 'encfs-browser.html not found - put it next to this script (npm run build:standalone)' }
# Prefer a gzip sidecar (smaller to distribute); served with Content-Encoding: gzip.
$gzFile = $htmlFile + '.gz'
$useGzip = Test-Path -LiteralPath $gzFile
$htmlBytes = if ($useGzip) { [IO.File]::ReadAllBytes($gzFile) } else { [IO.File]::ReadAllBytes($htmlFile) }
# Favicon embedded in this script (same artwork as public/favicon.svg), never read from disk.
# To refresh: [Convert]::ToBase64String([IO.File]::ReadAllBytes('..\public\favicon.svg'))
$iconBytes = [Convert]::FromBase64String('PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCIgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0Ij4KICA8ZGVmcz4KICAgIDxsaW5lYXJHcmFkaWVudCBpZD0iZyIgeDE9IjAiIHkxPSIwIiB4Mj0iMSIgeTI9IjEiPgogICAgICA8c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiM0ZjQ2ZTUiLz4KICAgICAgPHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjMjU2M2ViIi8+CiAgICA8L2xpbmVhckdyYWRpZW50PgogIDwvZGVmcz4KICA8cmVjdCB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHJ4PSIxNCIgZmlsbD0idXJsKCNnKSIvPgogIDxwYXRoIGQ9Ik0yMiAzMHYtOGExMCAxMCAwIDAgMSAyMCAwdjgiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSI2IiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KICA8cmVjdCB4PSIxNyIgeT0iMzAiIHdpZHRoPSIzMCIgaGVpZ2h0PSIyNCIgcng9IjUiIGZpbGw9IiNmZmYiLz4KICA8Y2lyY2xlIGN4PSIzMiIgY3k9IjQwIiByPSIzLjQiIGZpbGw9IiM0ZjQ2ZTUiLz4KICA8cGF0aCBkPSJNMzIgNDIuNXY1IiBzdHJva2U9IiM0ZjQ2ZTUiIHN0cm9rZS13aWR0aD0iMyIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+Cjwvc3ZnPgo=')
$version = '1.0.0'

function Log([string]$message) {
  $line = "{0}`t{1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $message
  try { Add-Content -LiteralPath (Join-Path $PSScriptRoot 'agent.log') -Value $line -Encoding utf8 } catch {}
  Write-Host $message
}

function Send-Response($stream, [int]$status, [string]$contentType, [byte[]]$body, [switch]$Gzip) {
  $reason = switch ($status) {
    200 { 'OK' } 400 { 'Bad Request' } 403 { 'Forbidden' } 404 { 'Not Found' }
    405 { 'Method Not Allowed' } default { 'Error' }
  }
  if ($null -eq $body) { $body = [byte[]]@() }
  $encoding = if ($Gzip) { "Content-Encoding: gzip`r`n" } else { '' }
  $head = "HTTP/1.1 $status $reason`r`nContent-Type: $contentType`r`n$encoding" + "Content-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
  $hb = [Text.Encoding]::ASCII.GetBytes($head)
  $stream.Write($hb, 0, $hb.Length)
  if ($body.Length) { $stream.Write($body, 0, $body.Length) }
  $stream.Flush()
}

function Read-Request($stream) {
  $buf = New-Object byte[] 8192
  $filled = 0
  while ($filled -lt $buf.Length) {
    $n = $stream.Read($buf, $filled, $buf.Length - $filled)
    if ($n -le 0) { break }
    $filled += $n
    $head = [Text.Encoding]::ASCII.GetString($buf, 0, [Math]::Min($filled, 8192))
    if ($head.Contains("`r`n`r`n")) { break }
  }
  if ($filled -ge $buf.Length) { return $null }
  $text = [Text.Encoding]::UTF8.GetString($buf, 0, $filled)
  $lines = $text -split "`r`n"
  if ($lines.Count -eq 0) { return $null }
  $parts = $lines[0] -split '\s+'
  if ($parts.Count -lt 2) { return $null }
  $headers = @{}
  foreach ($line in $lines[1..([Math]::Max(1, $lines.Count - 1))]) {
    if ($line -match '^([^:]+):\s*(.*)$') { $headers[$Matches[1].Trim().ToLower()] = $Matches[2].Trim() }
    if ($line -eq '') { break }
  }
  [pscustomobject]@{ Method = $parts[0]; Target = $parts[1]; Headers = $headers }
}

function Test-Allowed($req, [int]$port) {
  $allowedHosts = @("127.0.0.1:$port", "localhost:$port")
  if ($allowedHosts -notcontains $req.Headers['host']) { return $false }
  $origin = $req.Headers['origin']
  if (-not $origin) { return $true }
  return ($origin -eq 'null' -or $origin -eq "http://127.0.0.1:$port" -or $origin -eq "http://localhost:$port")
}

$listener = $null; $port = $StartPort
while ($port -le ($StartPort + 20)) {
  try {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $port)
    $listener.Start()
    break
  } catch { $port++ }
}
if (-not $listener) { throw "no free port in $StartPort..$($StartPort + 20)" }
$url = "http://127.0.0.1:$port/"
Log "encfs-agent-ps $version listening on $url"
Start-Process $url

while ($true) {
  $tcp = $listener.AcceptTcpClient()
  try {
    $stream = $tcp.GetStream()
    $req = Read-Request $stream
    if ($null -eq $req) { continue }
    if ($req.Method -ne 'GET') { Send-Response $stream 405 'text/plain' ([Text.Encoding]::UTF8.GetBytes('method not allowed')); continue }
    if (-not (Test-Allowed $req $port)) { Send-Response $stream 403 'text/plain' ([Text.Encoding]::UTF8.GetBytes('forbidden origin/host')); continue }

    $target = $req.Target.Split('?')
    $path = $target[0]
    $query = if ($target.Count -gt 1) { $target[1] } else { '' }
    switch ($path) {
      '/' { Send-Response $stream 200 'text/html; charset=utf-8' $htmlBytes -Gzip:$useGzip }
      '/favicon.svg' { Send-Response $stream 200 'image/svg+xml' $iconBytes }
      '/api/health' {
        $json = '{"ok":true,"name":"encfs-agent-ps","version":"' + $version + '"}'
        Send-Response $stream 200 'application/json' ([Text.Encoding]::UTF8.GetBytes($json))
      }
      '/api/shutdown' {
        Send-Response $stream 200 'application/json' ([Text.Encoding]::UTF8.GetBytes('{"ok":true}'))
        Log 'shutdown requested (/api/shutdown)'
        Start-Sleep -Milliseconds 80
        exit 0
      }
      '/api/roots' {
        $roots = @([IO.DriveInfo]::GetDrives() | Where-Object { $_.IsReady } | ForEach-Object {
            [pscustomobject]@{ name = $_.Name; path = $_.Name; label = $_.VolumeLabel }
          })
        $json = [pscustomobject]@{ roots = $roots } | ConvertTo-Json -Compress -Depth 3
        Send-Response $stream 200 'application/json' ([Text.Encoding]::UTF8.GetBytes($json))
      }
      '/api/list' {
        $pathParam = $null
        foreach ($pair in $query -split '&') {
          $kv = $pair.Split('=', 2)
          if ($kv.Count -eq 2 -and $kv[0] -eq 'path') { $pathParam = [Uri]::UnescapeDataString($kv[1]) }
        }
        if (-not $pathParam) {
          Send-Response $stream 400 'application/json' ([Text.Encoding]::UTF8.GetBytes('{"error":"missing path"}')); continue
        }
        if ($pathParam -notmatch '^([A-Za-z]:[\\/]|/|\\\\)') {
          Send-Response $stream 400 'application/json' ([Text.Encoding]::UTF8.GetBytes('{"error":"path must be absolute"}')); continue
        }
        if (($pathParam -split '[\\/]') -contains '..') {
          Send-Response $stream 400 'application/json' ([Text.Encoding]::UTF8.GetBytes('{"error":"''..'' is not allowed"}')); continue
        }
        try {
          $dir = [IO.DirectoryInfo]::new($pathParam)
          if (-not $dir.Exists) {
            Send-Response $stream 404 'application/json' ([Text.Encoding]::UTF8.GetBytes('{"error":"cannot read directory"}')); continue
          }
          $entries = @($dir.EnumerateFileSystemInfos() | Sort-Object { $_.Name.ToLower() } | ForEach-Object {
              $isDir = $_ -is [System.IO.DirectoryInfo]
              [pscustomobject]@{
                name  = $_.Name
                isDir = $isDir
                size  = if ($isDir) { 0 } else { $_.Length }
                mtime = [DateTimeOffset]::new($_.LastWriteTimeUtc).ToUnixTimeMilliseconds()
              }
            })
          $json = [pscustomobject]@{ path = $dir.FullName; entries = $entries } | ConvertTo-Json -Compress -Depth 4
          Send-Response $stream 200 'application/json' ([Text.Encoding]::UTF8.GetBytes($json))
        } catch {
          Send-Response $stream 404 'application/json' ([Text.Encoding]::UTF8.GetBytes('{"error":"cannot read directory"}'))
        }
      }
      default { Send-Response $stream 404 'application/json' ([Text.Encoding]::UTF8.GetBytes('{"error":"not found"}')) }
    }
  } catch {
    Log "error: $_"
  } finally {
    try { $tcp.Close() } catch {}
  }
}
