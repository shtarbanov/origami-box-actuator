param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$repoPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..')).TrimEnd('\')
function Get-DesignerSession([int]$port) {
    try {
        $request = [Net.HttpWebRequest]::Create("http://127.0.0.1:$port/__origami_designer")
        $request.Timeout = 500
        $request.ReadWriteTimeout = 500
        $response = $request.GetResponse()
        $reader = New-Object IO.StreamReader($response.GetResponseStream())
        try { return ($reader.ReadToEnd() | ConvertFrom-Json) }
        finally { $reader.Dispose(); $response.Dispose() }
    } catch { return $null }
}
function Test-Listening([int]$port) {
    $probe = New-Object Net.Sockets.TcpClient
    try { $task = $probe.ConnectAsync('127.0.0.1', $port); return ($task.Wait(150) -and $probe.Connected) }
    catch { return $false }
    finally { $probe.Dispose() }
}
try {
    $chosenPort = $null
    $freePort = $null
    foreach ($port in 4180..4199) {
        if (Test-Listening $port) {
            $session = Get-DesignerSession $port
            if ($session.schema -eq 'origami-box/local-session/1' -and $session.root -eq $repoPath) {
                $chosenPort = $port
                break
            }
        } elseif ($null -eq $freePort) {
            # Keep looking for a reusable server before starting another one.
            $freePort = $port
        }
    }
    if ($null -eq $chosenPort) {
        if ($null -eq $freePort) { throw 'No free local port between 4180 and 4199. Close an older preview and try again.' }
        $chosenPort = $freePort
        $runtime = Get-Command node.exe -ErrorAction SilentlyContinue
        if ($runtime) {
            $entryPath = Join-Path $repoPath 'designer\server.mjs'
            $arguments = @(('"' + $entryPath + '"'), '--repository', '--port', "$chosenPort")
        } else {
            $runtime = Get-Command python.exe -ErrorAction SilentlyContinue
            if (-not $runtime) { $runtime = Get-Command py.exe -ErrorAction SilentlyContinue }
            if (-not $runtime) { throw 'Install Node.js or Python once, then double-click Open Designer again.' }
            $entryPath = Join-Path $PSScriptRoot 'local_server.py'
            $arguments = @(('"' + $entryPath + '"'), '--port', "$chosenPort")
        }
        $serverProcess = Start-Process -FilePath $runtime.Source -ArgumentList $arguments -WorkingDirectory $repoPath -WindowStyle Hidden -PassThru
        $ready = $false
        for ($attempt = 0; $attempt -lt 50; $attempt++) {
            if (Test-Listening $chosenPort) {
                $session = Get-DesignerSession $chosenPort
                if ($session.schema -eq 'origami-box/local-session/1' -and $session.root -eq $repoPath) { $ready = $true; break }
            }
            if ($serverProcess.HasExited) { break }
            Start-Sleep -Milliseconds 100
        }
        if (-not $ready) { throw 'The local preview could not start. Check that Node.js or Python is installed and try again.' }
    }
    $url = "http://127.0.0.1:$chosenPort/designer/"
    if ($NoBrowser) { Write-Output $url } else { Start-Process $url }
} catch {
    if ($NoBrowser) { throw }
    Add-Type -AssemblyName System.Windows.Forms
    [Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Box Actuator Designer') | Out-Null
    exit 1
}
