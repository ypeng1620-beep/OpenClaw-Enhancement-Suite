# Integration Setup Script - npm link all suite packages
# Run this from the OpenClaw-Enhancement-Suite directory

param(
    [switch]$Unlink  # Use -Unlink to remove links instead
)

$ErrorActionPreference = "Stop"
$SuiteRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

$packs = @(
    "core",
    "tool-hub",
    "permission-hub",
    "context-hub",
    "mcp-hub",
    "coordinator-hub",
    "openclaw-integration"
)

if ($Unlink) {
    Write-Host "Removing npm links..." -ForegroundColor Yellow
    foreach ($pack in $packs) {
        $pkgPath = Join-Path $SuiteRoot "packages\$pack"
        if (Test-Path "$pkgPath\package.json") {
            Push-Location $pkgPath
            npm unlink 2>$null
            Pop-Location
            Write-Host "  Unlinked: $pack" -ForegroundColor Gray
        }
    }
    Write-Host "Done. Links removed." -ForegroundColor Green
    exit 0
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  OpenClaw Enhancement Suite - npm link" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Build
Write-Host "[1/3] Building packages..." -ForegroundColor Yellow
Push-Location $SuiteRoot
pnpm run build 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Build failed!" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location
Write-Host "  Build complete." -ForegroundColor Green

# Step 2: npm link globally
Write-Host "[2/3] Creating global npm links..." -ForegroundColor Yellow
foreach ($pack in $packs) {
    $pkgPath = Join-Path $SuiteRoot "packages\$pack"
    if (Test-Path "$pkgPath\package.json") {
        Push-Location $pkgPath
        npm link 2>&1 | Out-Null
        Pop-Location
        Write-Host "  Linked globally: $pack" -ForegroundColor Gray
    }
}

# Step 3: Instructions
Write-Host "[3/3] Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps in your project:" -ForegroundColor Cyan
Write-Host "  npm link @openclaw/suite-core" -ForegroundColor White
Write-Host "  npm link @openclaw/suite-tool-hub" -ForegroundColor White
Write-Host "  npm link @openclaw/suite-permission-hub" -ForegroundColor White
Write-Host "  npm link @openclaw/suite-context-hub" -ForegroundColor White
Write-Host "  npm link @openclaw/suite-mcp-hub" -ForegroundColor White
Write-Host "  npm link @openclaw/suite-coordinator-hub" -ForegroundColor White
Write-Host "  npm link @openclaw/suite-integration" -ForegroundColor White
Write-Host ""
Write-Host "Or run this script from your target project directory:" -ForegroundColor Cyan
Write-Host "  $PSCommandPath -Target" -ForegroundColor White
Write-Host ""
