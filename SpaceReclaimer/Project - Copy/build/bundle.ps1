# SpaceReclaimer Bundling Script
# This script builds a compact single-EXE (<5MB) NativeAOT application

$ErrorActionPreference = "Stop"
$OutputDir = "dist"
$MsiDir = "installer"

# Clean previous build artifacts
Write-Host "Cleaning previous build artifacts..." -ForegroundColor Cyan
if (Test-Path $OutputDir) { Remove-Item -Path $OutputDir -Recurse -Force }
if (Test-Path $MsiDir) { Remove-Item -Path $MsiDir -Recurse -Force }
New-Item -ItemType Directory -Path $OutputDir | Out-Null
New-Item -ItemType Directory -Path $MsiDir | Out-Null

# Set up build environment
Write-Host "Setting up build environment..." -ForegroundColor Cyan
$env:DOTNET_READYTORUN = 0
$env:DOTNET_TC_QUICKJITFORLOOPS = 1
$env:DOTNET_SYSTEM_GLOBALIZATION_INVARIANT = 1

# Build optimized NativeAOT EXE
Write-Host "Building optimized NativeAOT executable..." -ForegroundColor Cyan
dotnet publish -c Release -r win-x64 --self-contained `
    -p:PublishAot=true `
    -p:TrimMode=full `
    -p:IlcGenerateCompleteTypeMetadata=false `
    -p:IlcDisableReflection=true `
    -p:IlcFoldIdenticalMethodBodies=true `
    -p:IlcOptimizationPreference=Speed `
    -p:IlcGenerateStackTraceData=false `
    -p:DebugType=none `
    -p:DebugSymbols=false `
    -p:IlcInvariantGlobalization=true `
    -o $OutputDir

# Compress EXE using UPX for additional size reduction
Write-Host "Compressing executable with UPX..." -ForegroundColor Cyan
tools\upx\upx.exe --best --lzma "$OutputDir\SpaceReclaimer.exe"

# Sign EXE (requires code signing certificate)
# If you have a certificate, uncomment these lines:
# Write-Host "Signing executable..." -ForegroundColor Cyan
# & "SignTool.exe" sign /tr http://timestamp.digicert.com /td sha256 /fd sha256 /a "$OutputDir\SpaceReclaimer.exe"

# Verify EXE size is under 5MB
$exeSize = (Get-Item "$OutputDir\SpaceReclaimer.exe").Length / 1MB
Write-Host "Final executable size: $($exeSize.ToString("F2")) MB" -ForegroundColor Cyan

if ($exeSize -gt 5) {
    Write-Host "WARNING: Executable exceeds 5MB size constraint!" -ForegroundColor Red
} else {
    Write-Host "Size verification passed." -ForegroundColor Green
}

# Build MSI installer
Write-Host "Building MSI installer..." -ForegroundColor Cyan
Copy-Item -Path "$OutputDir\SpaceReclaimer.exe" -Destination "bin\Release\net7.0-windows\win-x64\publish\"

# Build with WiX toolset
& "tools\wix\candle.exe" -arch x64 installer.wxs -ext WixUIExtension -ext WixUtilExtension -o "$MsiDir\installer.wixobj"
& "tools\wix\light.exe" -out "$MsiDir\SpaceReclaimer.msi" "$MsiDir\installer.wixobj" -ext WixUIExtension -ext WixUtilExtension

# Sign MSI (requires code signing certificate)
# If you have a certificate, uncomment these lines:
# Write-Host "Signing MSI installer..." -ForegroundColor Cyan
# & "SignTool.exe" sign /tr http://timestamp.digicert.com /td sha256 /fd sha256 /a "$MsiDir\SpaceReclaimer.msi"

# Create Windows Package Manager manifest
Write-Host "Creating Windows Package Manager manifest..." -ForegroundColor Cyan
$manifestContent = @"
PackageIdentifier: YourCompany.SpaceReclaimer
PackageVersion: 1.0.0
PackageName: SpaceReclaimer
Publisher: Your Company
License: Proprietary
ShortDescription: High-Performance Disk Space Recovery Tool
Description: Maximize disk space recovery performance while maintaining system stability.
Moniker: spacereclaimer
Tags:
  - disk-cleanup
  - system-utility
  - disk-space
  - ntfs
Installers:
  - Architecture: x64
    InstallerType: msi
    InstallerUrl: https://example.com/download/SpaceReclaimer.msi
    InstallerSha256: $((Get-FileHash "$MsiDir\SpaceReclaimer.msi" -Algorithm SHA256).Hash)
    ProductCode: "{12345678-1234-1234-1234-123456789012}"
    MinimumOSVersion: 10.0.18362.0
    Scope: machine
ManifestType: singleton
ManifestVersion: 1.0.0
"@

$manifestContent | Out-File -FilePath "$MsiDir\YourCompany.SpaceReclaimer.yaml" -Encoding utf8

# Run validation tests
Write-Host "Running validation tests..." -ForegroundColor Cyan
$testDrive = "C" # Default test drive, change if needed
Write-Host "Warning: Running benchmark tests on drive $testDrive`:\"

# Run the benchmark tool
& "$OutputDir\SpaceReclaimer.exe" /benchmark /drive:$testDrive

Write-Host "Packaging complete!" -ForegroundColor Green
Write-Host "Output files:"
Write-Host "  Executable: $OutputDir\SpaceReclaimer.exe"
Write-Host "  Installer:  $MsiDir\SpaceReclaimer.msi"
Write-Host "  Manifest:   $MsiDir\YourCompany.SpaceReclaimer.yaml"
