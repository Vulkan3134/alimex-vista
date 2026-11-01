<#
  Servidor estatico local para la plataforma de inventario y logistica.

  - Solo escucha en "localhost" (no es accesible desde otros equipos de la red).
  - Sin dependencias: usa System.Net.HttpListener, incluido en Windows.
  - Sirve unicamente archivos dentro de esta carpeta (bloquea rutas fuera de ella).

  Uso:   .\servidor.ps1 [-Port 8765] [-NoBrowser]
  Salir: Ctrl + C
#>
param(
    [int]$Port = 8765,
    [switch]$NoBrowser,
    [string]$Root = $PSScriptRoot
)

$ErrorActionPreference = 'Stop'
$rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd('\')

$mime = @{
    '.html' = 'text/html; charset=utf-8'
    '.htm' = 'text/html; charset=utf-8'
    '.js' = 'text/javascript; charset=utf-8'
    '.mjs' = 'text/javascript; charset=utf-8'
    '.css' = 'text/css; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.webmanifest' = 'application/manifest+json; charset=utf-8'
    '.svg' = 'image/svg+xml'
    '.png' = 'image/png'
    '.jpg' = 'image/jpeg'
    '.jpeg' = 'image/jpeg'
    '.gif' = 'image/gif'
    '.ico' = 'image/x-icon'
    '.txt' = 'text/plain; charset=utf-8'
    '.md' = 'text/plain; charset=utf-8'
    '.csv' = 'text/csv; charset=utf-8'
    '.woff' = 'font/woff'
    '.woff2' = 'font/woff2'
}
$blockedExt = @('.ps1', '.bat', '.cmd', '.vbs')

# Busca el primer puerto libre a partir de $Port.
$listener = $null
for ($p = $Port; $p -lt ($Port + 20); $p++) {
    $candidate = New-Object System.Net.HttpListener
    $candidate.Prefixes.Add("http://localhost:$p/")
    try {
        $candidate.Start()
        $listener = $candidate
        $Port = $p
        break
    }
    catch {
        $candidate.Close()
    }
}
if ($null -eq $listener) {
    Write-Host "No fue posible abrir un puerto local entre $Port y $($Port + 19)." -ForegroundColor Red
    exit 1
}

$url = "http://localhost:$Port/"
Write-Host ""
Write-Host "  Plataforma de inventario y logistica - servidor local" -ForegroundColor Cyan
Write-Host "  DATOS FICTICIOS DE DEMOSTRACION - sin conexion a Microsoft Dynamics" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Direccion : $url"
Write-Host "  Carpeta   : $rootFull"
Write-Host "  Para salir: presione Ctrl + C en esta ventana"
Write-Host ""

if (-not $NoBrowser) {
    try { Start-Process $url } catch { Write-Host "  Abra manualmente: $url" }
}

try {
    while ($listener.IsListening) {
        $async = $listener.BeginGetContext($null, $null)
        while (-not $async.AsyncWaitHandle.WaitOne(250)) { }
        $ctx = $listener.EndGetContext($async)
        $req = $ctx.Request
        $res = $ctx.Response
        $status = 200
        try {
            if ($req.HttpMethod -ne 'GET' -and $req.HttpMethod -ne 'HEAD') {
                $status = 405
            }
            else {
                $rel = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath).TrimStart('/')
                if ([string]::IsNullOrEmpty($rel)) { $rel = 'index.html' }
                $rel = $rel -replace '/', '\'
                $full = [System.IO.Path]::GetFullPath((Join-Path $rootFull $rel))
                $inside = $full.Equals($rootFull, [System.StringComparison]::OrdinalIgnoreCase) -or
                          $full.StartsWith($rootFull + '\', [System.StringComparison]::OrdinalIgnoreCase)
                if (-not $inside) {
                    $status = 403
                }
                else {
                    if (Test-Path -LiteralPath $full -PathType Container) {
                        $full = Join-Path $full 'index.html'
                    }
                    $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
                    $hidden = ($full.Substring($rootFull.Length) -split '\\' | Where-Object { $_.StartsWith('.') }).Count -gt 0
                    if ($hidden -or ($blockedExt -contains $ext) -or -not (Test-Path -LiteralPath $full -PathType Leaf)) {
                        $status = 404
                    }
                    else {
                        $bytes = [System.IO.File]::ReadAllBytes($full)
                        $contentType = $mime[$ext]
                        if (-not $contentType) { $contentType = 'application/octet-stream' }
                        $res.ContentType = $contentType
                        $res.Headers.Add('Cache-Control', 'no-cache')
                        $res.Headers.Add('X-Content-Type-Options', 'nosniff')
                        $res.ContentLength64 = $bytes.Length
                        if ($req.HttpMethod -ne 'HEAD') {
                            $res.OutputStream.Write($bytes, 0, $bytes.Length)
                        }
                    }
                }
            }
        }
        catch {
            $status = 500
        }
        finally {
            try {
                if ($status -ne 200) {
                    $res.StatusCode = $status
                    Write-Host ("  {0} {1} -> {2}" -f $req.HttpMethod, $req.Url.AbsolutePath, $status) -ForegroundColor DarkYellow
                }
                $res.Close()
            }
            catch { }
        }
    }
}
finally {
    $listener.Stop()
    $listener.Close()
    Write-Host "  Servidor detenido."
}
