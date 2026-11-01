<#
  Ejecuta las pruebas funcionales en un navegador sin ventana (Edge o Chrome) y muestra el resultado.
  No requiere Node ni Python. Uso:   .\pruebas.ps1            (o doble clic en pruebas.bat)
  Codigo de salida: 0 = todo correcto, 1 = hay pruebas fallidas o no se pudo ejecutar.
#>
param(
    [int]$Port = 8791,
    [string]$Page = 'tests/',
    [string]$Selector = 'resultado'
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$root = $PSScriptRoot

$candidates = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$browser = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) {
    Write-Host 'No se encontro Microsoft Edge ni Google Chrome.' -ForegroundColor Red
    exit 1
}

$serverArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $root 'servidor.ps1'), '-Port', $Port, '-NoBrowser')
$server = Start-Process powershell -ArgumentList $serverArgs -PassThru -WindowStyle Hidden
$profileDir = Join-Path $env:TEMP ('alimex-pruebas-' + [guid]::NewGuid().ToString('N'))
$exit = 1
try {
    $ready = $false
    for ($i = 0; $i -lt 50 -and -not $ready; $i++) {
        Start-Sleep -Milliseconds 200
        try {
            $r = Invoke-WebRequest -Uri "http://localhost:$Port/$Page" -UseBasicParsing -TimeoutSec 2
            $ready = $true
        } catch {
            # Cualquier respuesta HTTP (incluso 404) indica que el servidor ya esta activo.
            if ($_.Exception.Response) { $ready = $true }
        }
    }
    if (-not $ready) { throw 'El servidor local no respondio.' }

    $url = "http://localhost:$Port/$Page"
    $browserArgs = @(
        '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        "--user-data-dir=$profileDir", '--virtual-time-budget=180000', '--dump-dom', $url
    )
    # El navegador es una aplicacion grafica: su salida se captura redirigiendola a un archivo.
    $outFile = Join-Path $env:TEMP ('alimex-dom-' + [guid]::NewGuid().ToString('N') + '.html')
    $errFile = $outFile + '.err'
    $quoted = $browserArgs | ForEach-Object { if ($_ -match '\s') { '"' + $_ + '"' } else { $_ } }
    $p = Start-Process -FilePath $browser -ArgumentList ($quoted -join ' ') -RedirectStandardOutput $outFile -RedirectStandardError $errFile -NoNewWindow -PassThru
    if (-not $p.WaitForExit(170000)) { try { $p.Kill() } catch { } }
    $dom = ''
    if (Test-Path $outFile) {
        # Procesos hijos del navegador pueden conservar el archivo abierto: se lee permitiendo uso compartido.
        $fs = New-Object System.IO.FileStream($outFile, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, ([System.IO.FileShare]::ReadWrite -bor [System.IO.FileShare]::Delete))
        try {
            $reader = New-Object System.IO.StreamReader($fs, [System.Text.Encoding]::UTF8)
            $dom = $reader.ReadToEnd()
        } finally { $fs.Dispose() }
    }
    Remove-Item $outFile, $errFile -Force -ErrorAction SilentlyContinue
    $pattern = '(?s)<pre id="' + $Selector + '">(.*?)</pre>'
    if ($dom -match $pattern) {
        $text = [System.Net.WebUtility]::HtmlDecode($Matches[1])
        Write-Output $text
        if ($text -match 'RESUMEN: \d+ pasaron, 0 fallaron') { $exit = 0 }
    } else {
        Write-Host 'No se encontro el resultado de las pruebas en la pagina.' -ForegroundColor Red
        Write-Output $dom.Substring(0, [Math]::Min(2000, $dom.Length))
    }
}
finally {
    if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force }
    if (Test-Path $profileDir) { Remove-Item $profileDir -Recurse -Force -ErrorAction SilentlyContinue }
}
exit $exit
