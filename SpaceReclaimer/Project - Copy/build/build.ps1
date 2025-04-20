$ErrorActionPreference = "Stop"

# Clean previous build
if (Test-Path -Path "bin\Release") {
    Remove-Item -Path "bin\Release" -Recurse -Force
}

# Build with NativeAOT
dotnet publish -c Release -r win-x64 --self-contained -p:PublishAot=true -p:TrimMode=full

# Verify size is under 5MB
$exePath = "bin\Release\net7.0-windows\win-x64\publish\SpaceReclaimer.exe"
$fileSize = (Get-Item $exePath).Length / 1MB

Write-Host "Output file size: $($fileSize.ToString("F2")) MB"

if ($fileSize -gt 5) {
    Write-Warning "WARNING: Output file size exceeds 5MB requirement!"
}

# Build WiX installer
& "tools\wix\candle.exe" -arch x64 installer.wxs -ext WixUIExtension -ext WixUtilExtension
& "tools\wix\light.exe" -out SpaceReclaimer.msi installer.wixobj -ext WixUIExtension -ext WixUtilExtension

# Sign EXE and MSI (requires code signing certificate)
& "signtool.exe" sign /tr http://timestamp.digicert.com /td sha256 /fd sha256 /a $exePath
& "signtool.exe" sign /tr http://timestamp.digicert.com /td sha256 /fd sha256 /a SpaceReclaimer.msi

Write-Host "Build completed successfully"
