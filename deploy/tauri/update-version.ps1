param([string]$Version)

(Get-Content 'src-tauri\Cargo.toml') |
    ForEach-Object { $_ -replace '^version = "[\d.]+"', "version = `"$Version`"" } |
    Set-Content 'src-tauri\Cargo.toml'

(Get-Content 'src-tauri\tauri.conf.json') |
    ForEach-Object { $_ -replace '"version": "[\d.]+"', "`"version`": `"$Version`"" } |
    Set-Content 'src-tauri\tauri.conf.json'

(Get-Content 'src-tauri\splash\splash.html') |
    ForEach-Object { $_ -replace 'v\d+\.\d+\.\d+', "v$Version" } |
    Set-Content 'src-tauri\splash\splash.html'

Write-Host "[tauri-build] Version set to $Version"
