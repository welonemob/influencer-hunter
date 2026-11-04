$ErrorActionPreference = 'Stop'

Write-Host '== Influencer Hunter: Windows x64 build ==' -ForegroundColor Cyan

foreach ($tool in @('node', 'npm', 'cargo', 'rustc')) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        throw "Не найден $tool. Для сборки нужны Node.js LTS и Rust stable. Готовому установленному приложению эти инструменты не нужны."
    }
}

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host 'Установка npm-зависимостей...' -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) { throw 'npm install завершился с ошибкой.' }

Write-Host 'Сборка Tauri-приложения и NSIS установщика...' -ForegroundColor Yellow
npm run tauri:build
if ($LASTEXITCODE -ne 0) { throw 'Сборка Tauri завершилась с ошибкой.' }

$bundleDir = Join-Path $root 'src-tauri\target\release\bundle\nsis'
$setup = Get-ChildItem -Path $bundleDir -Filter '*setup.exe' | Select-Object -First 1
if (-not $setup) { throw "NSIS setup.exe не найден в $bundleDir" }

$target = Join-Path $bundleDir 'InfluencerHunter_Setup.exe'
if ($setup.FullName -ne $target) { Copy-Item $setup.FullName $target -Force }
Write-Host "Готово: $target" -ForegroundColor Green
