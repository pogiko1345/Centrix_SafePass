param(
    [ValidateSet('full', 'visitor')]
    [string]$Variant = 'full'
)

$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$env:NODE_ENV = 'production'
$env:EXPO_NO_DOTENV = '1'
$env:EXPO_PUBLIC_APP_VARIANT = $Variant
$env:EXPO_PUBLIC_API_MODE = 'production'
$env:EXPO_PUBLIC_API_BASE_URL = 'https://safepass-052h.onrender.com/api'
$env:EXPO_PUBLIC_ENABLE_DEV_FALLBACK = 'false'
$env:EXPO_PUBLIC_E2E_LOCAL_ONLY = 'false'
$buildVariant = (Get-Culture).TextInfo.ToTitleCase($Variant)

# Generate native bindings on the real drive before using a short SUBST path.
# React Native codegen cannot relativize paths across the two drive letters.
$canonicalProjectDirectory = rtk proxy node -e "process.stdout.write(require('fs').realpathSync.native(process.argv[1]))" $projectDirectory
if ($LASTEXITCODE -ne 0) { throw 'Unable to resolve the Android project directory.' }
if ([IO.Path]::GetPathRoot($canonicalProjectDirectory) -ne [IO.Path]::GetPathRoot($projectDirectory)) {
    Push-Location (Join-Path $canonicalProjectDirectory 'android')
    try {
        rtk proxy .\gradlew.bat generateCodegenArtifactsFromSchema --console=plain --max-workers=2 '-Pkotlin.incremental=false'
        if ($LASTEXITCODE -ne 0) { throw 'Android native code generation failed.' }
    } finally {
        Pop-Location
    }
}

Push-Location (Join-Path $projectDirectory 'android')
try {
    # Substituted drives can disagree with canonical dependency paths in Kotlin's cache.
    rtk proxy .\gradlew.bat ":app:assemble${buildVariant}Release" --console=plain --max-workers=2 '-Pkotlin.incremental=false'
    if ($LASTEXITCODE -ne 0) {
        throw "Android build failed with exit code $LASTEXITCODE."
    }
} finally {
    Pop-Location
}

$apkOutputDirectory = Join-Path $projectDirectory "android\app\build\outputs\apk\$Variant\release"
$apkMetadata = Get-Content -LiteralPath (Join-Path $apkOutputDirectory 'output-metadata.json') -Raw | ConvertFrom-Json
$apkOutputFile = $apkMetadata.elements[0].outputFile
if (-not $apkOutputFile -or [IO.Path]::GetFileName($apkOutputFile) -ne $apkOutputFile) {
    throw 'Android build metadata did not contain a valid APK filename.'
}
$apkSource = Join-Path $apkOutputDirectory $apkOutputFile
$downloadDirectory = Join-Path $projectDirectory 'dist'
New-Item -ItemType Directory -Path $downloadDirectory -Force | Out-Null
$apkName = if ($Variant -eq 'full') { 'CentrixMobile.apk' } else { 'SafePass-Visitor-Live.apk' }
$apkDestination = Join-Path $downloadDirectory $apkName
Copy-Item -LiteralPath $apkSource -Destination $apkDestination -Force
Write-Output "APK ready: $apkDestination"
