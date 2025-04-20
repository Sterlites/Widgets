$ErrorActionPreference = "Stop"

# Clean previous build
if (Test-Path -Path "bin\Release") {
    Remove-Item -Path "bin\Release" -Recurse -Force
}
if (Test-Path -Path "obj\Release") { # Also good to clean obj
    Remove-Item -Path "obj\Release" -Recurse -Force
}

# Build the Windows Forms application (NativeAOT removed)
# Let the .csproj file control AOT/Trimming settings (which should be disabled for WinForms)
Write-Host "Building project (AOT/Trimming disabled in csproj)..."
dotnet publish -c Release -r win-x64 --self-contained true

# Verify size (adjust expectation as non-AOT build will be larger)
$exePath = "bin\Release\net7.0-windows\win-x64\publish\SpaceReclaimer.exe"

# Check if the file exists before trying to get its size
if (!(Test-Path $exePath)) {
    Write-Error "Build failed: Executable not found at $exePath"
    exit 1 # Exit the script if build failed
}

$fileSize = (Get-Item $exePath).Length / 1MB

Write-Host "Output file size: $($fileSize.ToString("F2")) MB"

# WARNING: Non-AOT builds are significantly larger than 5MB.
# You will need to adjust this check or accept the larger size.
$maxSizeMB = 50 # Example: Adjusted max size to 50MB, change as needed
if ($fileSize -gt $maxSizeMB) {
    Write-Warning "WARNING: Output file size ($($fileSize.ToString("F2")) MB) exceeds $($maxSizeMB)MB target!"
    # Decide if this should be a blocking error or just a warning
    # exit 1 # Uncomment to make the build fail if too large
} else {
     Write-Host "File size is within the $($maxSizeMB)MB target."
}

# Build WiX installer (Ensure WiX tools are available in tools\wix or in PATH)
Write-Host "Building WiX installer..."
if (!(Test-Path "tools\wix\candle.exe") -or !(Test-Path "tools\wix\light.exe")) {
    Write-Warning "WiX tools not found in .\tools\wix\. Skipping installer build."
} else {
    & "tools\wix\candle.exe" -arch x64 installer.wxs -ext WixUIExtension -ext WixUtilExtension
    & "tools\wix\light.exe" -out SpaceReclaimer.msi installer.wixobj -ext WixUIExtension -ext WixUtilExtension
    Write-Host "WiX installer built."
}


# Sign EXE and MSI (requires signtool.exe and a valid certificate properly installed/configured)
Write-Host "Signing outputs (requires signtool.exe and certificate)..."
if ((Get-Command signtool.exe -ErrorAction SilentlyContinue) -eq $null) {
     Write-Warning "signtool.exe not found in PATH. Skipping code signing."
} else {
    # Check if files to be signed exist
    if(Test-Path $exePath) {
        Write-Host "Signing $exePath..."
        & "signtool.exe" sign /tr http://timestamp.digicert.com /td sha256 /fd sha256 /a $exePath
    } else {
         Write-Warning "Executable $exePath not found for signing."
    }

    if(Test-Path "SpaceReclaimer.msi") {
        Write-Host "Signing SpaceReclaimer.msi..."
        & "signtool.exe" sign /tr http://timestamp.digicert.com /td sha256 /fd sha256 /a SpaceReclaimer.msi
    } else {
         Write-Warning "MSI file SpaceReclaimer.msi not found for signing (likely WiX build skipped or failed)."
    }
    Write-Host "Signing process attempted."
}

Write-Host "Build script finished."