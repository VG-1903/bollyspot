# Embeds data/songs.json into index.template.html -> index.html
$dir = $PSScriptRoot
$json = [IO.File]::ReadAllText("$dir\data\songs.json").Replace('</', '<\/')
$html = [IO.File]::ReadAllText("$dir\index.template.html").Replace('/*__SONGS__*/', $json)
[IO.File]::WriteAllText("$dir\index.html", $html, [Text.UTF8Encoding]::new($false))
Write-Host ("index.html built ({0:N1} MB)" -f ((Get-Item "$dir\index.html").Length / 1MB))
