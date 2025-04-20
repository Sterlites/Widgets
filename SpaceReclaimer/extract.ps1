# D:\RDx\DevBox\Widgets\SpaceReclaimer\extract.ps1

$sourceFile = "D:\RDx\DevBox\Widgets\SpaceReclaimer\1.txt"
$baseDir = "D:\RDx\DevBox\Widgets\SpaceReclaimer\Project"

# Create base directory structure
$dirs = @(
    "",
    "Core",
    "UI",
    "Benchmark",
    "build",
    "installer",
    "tools\wix",
    "tools\upx"
)

foreach ($dir in $dirs) {
    $path = Join-Path -Path $baseDir -ChildPath $dir
    if (-not (Test-Path $path)) {
        New-Item -Path $path -ItemType Directory -Force | Out-Null
    }
}

# Parse source file and extract code blocks
$content = Get-Content -Path $sourceFile -Raw
$pattern = '#region\s+([^\r\n]+)[\r\n]+(.+?)#endregion'
$matches = [regex]::Matches($content, $pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)

foreach ($match in $matches) {
    $fileName = $match.Groups[1].Value.Trim()
    $fileContent = $match.Groups[2].Value.Trim()
    
    # Map region name to actual file path
    switch -Regex ($fileName) {
        '^Core\/(.+)\.cs$' {
            $filePath = Join-Path -Path $baseDir -ChildPath "Core\$($Matches[1]).cs"
            break
        }
        '^UI\/(.+)\.cs$' {
            $filePath = Join-Path -Path $baseDir -ChildPath "UI\$($Matches[1]).cs"
            break
        }
        '^Benchmark\/(.+)\.cs$' {
            $filePath = Join-Path -Path $baseDir -ChildPath "Benchmark\$($Matches[1]).cs"
            break
        }
        '^installer\.wxs$' {
            $filePath = Join-Path -Path $baseDir -ChildPath "installer\installer.wxs"
            break
        }
        '^build\.ps1$' {
            $filePath = Join-Path -Path $baseDir -ChildPath "build\build.ps1"
            break
        }
        '^bundle\.ps1$' {
            $filePath = Join-Path -Path $baseDir -ChildPath "build\bundle.ps1"
            break
        }
        '^SpaceReclaimer\.csproj$' {
            $filePath = Join-Path -Path $baseDir -ChildPath "SpaceReclaimer.csproj"
            break
        }
        '^app\.manifest$' {
            $filePath = Join-Path -Path $baseDir -ChildPath "app.manifest"
            break
        }
        '^rd\.xml$' {
            $filePath = Join-Path -Path $baseDir -ChildPath "rd.xml"
            break
        }
        '^Program\.cs$' {
            $filePath = Join-Path -Path $baseDir -ChildPath "Program.cs"
            break
        }
        default {
            Write-Warning "Unknown file pattern: $fileName"
            continue
        }
    }
    
    # Write content to file
    Set-Content -Path $filePath -Value $fileContent -Encoding UTF8
    Write-Host "Created file: $filePath"
}

Write-Host "`nSpaceReclaimer project files have been created at $baseDir"
Write-Host "To build the project, navigate to the directory and run: .\build\build.ps1"
