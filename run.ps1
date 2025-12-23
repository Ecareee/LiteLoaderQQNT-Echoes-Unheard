$projectDir = "D:\webdev\LiteLoaderQQNT-Echoes-Unheard"
$pluginName = "echoes_unheard"
$pluginZip = "$projectDir\$pluginName.zip"
$outDir = "$projectDir\$pluginName"
$pluginDir = "D:\LiteLoaderQQNT\plugins"
$qqDir = "C:\Program Files\Tencent\QQNT"

Set-Location $projectDir
pnpm build

if (Test-Path $outDir) {
    Remove-Item $outDir -Recurse -Force
}
New-Item -ItemType Directory -Path $outDir | Out-Null

Expand-Archive -Path $pluginZip -DestinationPath $outDir -Force

$targetPluginDir = "$pluginDir\$pluginName"

if (Test-Path $targetPluginDir) {
    Remove-Item $targetPluginDir -Recurse -Force
}

Move-Item $outDir $pluginDir

Set-Location $qqDir
Start-Process "debug.cmd"
