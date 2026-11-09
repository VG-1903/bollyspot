# Rebuilds the whole song catalog from the iTunes Search API using tools/sources.json.
# Writes tools/out/catalog.raw.json; run `node tools/dedupe.js` afterwards to produce data/songs.json.
param([double]$Sleep = 3.2)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$src = Get-Content "$PSScriptRoot\sources.json" -Raw | ConvertFrom-Json

$southEx = 'Tamil|Telugu|Kollywood|Tollywood|Malayalam|Kannada|Bhojpuri|Marathi|Bengali|Gujarati|Odia|Assamese|South'
$junkRx = '(?i)\b(instrumental|karaoke|dialogue|interlude|medley|narration|promo|jukebox|ringtone|bgm|story|scene)\b'
$scoreRx = 'John Stewart Eduri|Harshavardhan Rameshwar|Sanchit Balhara|Ketan Sodha|Hitesh Sonik|Julius Packiam|Simaab Sen|Prasad Sashte|Joel Crasto|Amar Mohile'
# words that mark an alternate recording when they appear in brackets or after " - "
$versionRx = '(?i)\b(remix|rmx|unplugged|live|acoustic|demo|instrumental|karaoke|sped ?up|slowed|reverb|lo-?fi|mashup|cover|reprise|jhankar|mix|version|dub|extended|revisited|recreated|rewind|redux|female|male|sad|club|dj|bootleg|vip|edit|session|rehearsal|piano|orchestral|a cappella|cappella|stripped|flip|house|techno|edm|trap|bass|chill|chillout|lounge|rework|refix|tribute|8d|nightcore|drill|operatic|medley|dance)\b'
# bracket text that is NOT an alternate recording
$okPartRx = '(?i)^\s*(from\b|feat|ft\.|with\b|original|.*remaster|single version|radio edit|album version|mono|stereo|taylor.?s version|explicit|clean)'
# bare-title version words (Indian catalogs often omit brackets)
$bareIndianRx = '(?i)\b(remix|unplugged|lo-?fi|jhankar|reprise|mashup|acoustic|cover|slowed|reverb|version|mix|dj|recreated|revisited|flip|tech house|edm|trap)\b'
$bareEnglishRx = '(?i)\b(remix|mashup|sped ?up|slowed|lo-?fi)\b'
$eraCaps = @(
    @{ rx = 'Mohammed Rafi|Mohd\. Rafi|Mohd Rafi|Md\. Rafi'; cap = 1980 },
    @{ rx = '^Mukesh$|Mukesh &|& Mukesh'; cap = 1976 },
    @{ rx = 'Kishore Kumar'; cap = 1987 },
    @{ rx = 'Manna Dey'; cap = 1992 },
    @{ rx = 'Geeta Dutt'; cap = 1972 },
    @{ rx = 'Hemant Kumar'; cap = 1989 },
    @{ rx = 'Talat Mahmood'; cap = 1975 },
    @{ rx = 'Noor Jehan'; cap = 1985 }
)

function N($s) { return ($s.ToLower() -replace '[^a-z0-9]', '') }
function IsVersion($tn, $indian) {
    $parts = @([regex]::Matches($tn, '[\(\[]([^\)\]]*)[\)\]]') | % { $_.Groups[1].Value })
    $dash = [regex]::Match($tn, '\s[-–]\s(.+)$')
    if ($dash.Success) { $parts += $dash.Groups[1].Value }
    foreach ($p in $parts) {
        if ($p -match $okPartRx) { continue }
        if ($p -match $versionRx) { return $true }
    }
    $bare = ($tn -replace '[\(\[][^\)\]]*[\)\]]', '')
    if ($indian) { return $bare -match $bareIndianRx }
    return $bare -match $bareEnglishRx
}
function CleanName($tn) {
    $n = $tn -replace '\s*[\(\[][^\)\]]*[\)\]]', ''
    $n = $n -replace '\s[-–]\s.*$', ''
    return $n.Trim()
}
function DupKey($lang, $name) { return $lang + (($name.ToLower()) -replace '(,?\s*(pt|part)\.?\s*\d+)', '' -replace '[^a-z0-9]', '') }

$map = [ordered]@{}
$stats = @{ added = 0; upgraded = 0; versions = 0 }
function Merge($e) {
    $k = DupKey $e.l $e.t
    if ($map.Contains($k)) {
        $old = $map[$k]
        $diffFilm = $old.m -and $e.m -and ((N $old.m) -ne (N $e.m))
        $diffYear = $old.y -gt 0 -and $e.y -gt 0 -and [math]::Abs($old.y - $e.y) -gt 3
        if ($diffFilm -or $diffYear) {
            $k2 = $k + '|' + (N $e.m) + $e.y
            if (-not $map.Contains($k2)) { $map[$k2] = $e; $stats.added++ }
            return
        }
        if ($e.f -eq 1 -and $old.f -ne 1) { $old.f = 1; $stats.upgraded++ }
        if ($e.m -and -not $old.m) { $old.m = $e.m }
        if ($e.y -gt 0 -and ($old.y -le 0 -or $old.y -gt $e.y)) { $old.y = $e.y }
    } else { $map[$k] = $e; $stats.added++ }
}
function Get-Itunes($term, $country) {
    $url = 'https://itunes.apple.com/search?term=' + [uri]::EscapeDataString($term) + "&country=$country&media=music&entity=song&limit=200"
    for ($i = 0; $i -lt 4; $i++) {
        try { $r = Invoke-RestMethod -Uri $url -TimeoutSec 30; Start-Sleep -Seconds $Sleep; return $r }
        catch { Write-Host "  retry ($term): $($_.Exception.Message)"; Start-Sleep -Seconds (15 * ($i + 1)) }
    }
    return $null
}
function Entry($t, $name, $cat, $lang, $movie, $year, $famous) {
    return [pscustomobject]@{
        t = $name; a = $t.artistName; m = $movie; y = $year; p = $t.previewUrl
        art = ($t.artworkUrl100 -replace '100x100', '300x300'); c = $cat; l = $lang; f = $famous
        id = $t.trackId; g = $t.primaryGenreName
    }
}

# ---- 1. film soundtracks (authoritative film + year, all famous) ----
foreach ($mv in $src.films) {
    $title, $yr = $mv.Split('|'); $yr = [int]$yr
    $want = N $title
    $minSec = if ($yr -lt 2000) { 90 } else { 150 }
    $r = Get-Itunes $title 'IN'
    if (-not $r) { Write-Host "FAILED film: $title"; continue }
    $kept = 0
    foreach ($t in $r.results) {
        if (-not $t.previewUrl) { continue }
        if ($t.primaryGenreName -notmatch '^(Bollywood|Filmi|Indian Pop|Sufi|Ghazal|Hindi Pop|Soundtrack)$') { continue }
        if ("$($t.collectionName) $($t.trackName)" -match $southEx) { continue }
        if ($t.trackName -match $junkRx -or $t.trackName -match '(?i)\b(theme|title music|pocket cinema|making of)\b') { continue }
        if (IsVersion $t.trackName $true) { $stats.versions++; continue }
        if (@($t.artistName -split ',|&').Count -ge 6) { continue }
        if ($t.trackTimeMillis -and $t.trackTimeMillis -lt ($minSec * 1000)) { continue }
        if ($t.trackName.Trim().EndsWith('!')) { continue }
        if ($t.artistName -match $scoreRx) { continue }
        if ($t.releaseDate) {
            $ry = [int]([datetime]$t.releaseDate).Year
            if ($ry -lt $yr - 1 -or $ry -gt $yr + 2) { continue }
        }
        $coll = (($t.collectionName -replace '\s*[\(\[].*?[\)\]]', '') -split '\s+-\s+|:')[0]
        $fromOk = $false
        if ($t.trackName -match "From [`"']([^`"']+)[`"']") { $fromOk = ((N $Matches[1]) -eq $want) }
        if (-not $fromOk -and (N $coll) -ne $want) { continue }
        $name = CleanName $t.trackName
        if (($name -replace '[^a-zA-Z0-9]', '').Length -lt 3) { continue }
        Merge (Entry $t $name 'b' 'hi' $title $yr 1); $kept++
    }
    Write-Host "film/$title ($yr) -> $kept"
}

# ---- 2. artist searches ----
function Fetch-Artists($queries, $cat, $lang, $country, $genreRx, $indian, $minSec) {
    foreach ($q in $queries) {
        $r = Get-Itunes $q $country
        if (-not $r) { Write-Host "FAILED artist: $q"; continue }
        $kept = 0; $rank = -1
        foreach ($t in $r.results) {
            $rank++
            if (-not $t.previewUrl) { continue }
            if ($t.primaryGenreName -notmatch $genreRx) { continue }
            if ($indian -and "$($t.collectionName) $($t.trackName)" -match $southEx) { continue }
            if ($t.trackName -match $junkRx) { continue }
            if (IsVersion $t.trackName $indian) { $stats.versions++; continue }
            if ($t.trackTimeMillis -and $t.trackTimeMillis -lt ($minSec * 1000)) { continue }
            if ($t.artistName -match $scoreRx) { continue }
            $name = CleanName $t.trackName
            if (($name -replace '[^a-zA-Z0-9]', '').Length -lt 3) { continue }
            $year = 0
            if ($t.releaseDate) { $year = [int]([datetime]$t.releaseDate).Year }
            foreach ($ec in $eraCaps) { if ($t.artistName -match $ec.rx -and $year -gt $ec.cap) { $year = $ec.cap } }
            $movie = ''
            if ($t.trackName -match "From [`"']([^`"']+)[`"']") { $movie = $Matches[1] }
            elseif ($cat -eq 'b' -and $t.collectionName -match "^([^\(]+?)\s*\((Original|Motion)") { $movie = $Matches[1].Trim() }
            Merge (Entry $t $name $cat $lang $movie $year ([int]($rank -lt 30))); $kept++
        }
        Write-Host "$cat/$q -> $kept"
    }
}
Fetch-Artists $src.bollywood 'b' 'hi' 'IN' '^(Bollywood|Filmi|Indian Pop|Sufi|Ghazal|Hindi Pop)$' $true 120
Fetch-Artists $src.indie 'i' 'hi' 'IN' 'Indian Pop|Pop|Hip-Hop|Rap|Rock|Alternative|Singer|Folk|R&B|Indie|Electronic|Dance|Sufi|World|Qawwali|Ghazal|Indian' $true 100
Fetch-Artists $src.punjabi 'p' 'pa' 'IN' 'Punjabi|Indian Pop|Pop|Hip-Hop|Rap|Bhangra|Folk|World|Indian|R&B' $true 100
Fetch-Artists $src.hollywood 'h' 'en' 'US' 'Pop|Rock|Hip-Hop|Rap|R&B|Soul|Alternative|Dance|Country|Metal|Singer|Soundtrack|Electronic|Disco|Vocal|Reggae|Funk|K-Pop|Blues|Folk|Indie' $false 100

New-Item -ItemType Directory -Force "$PSScriptRoot\out" | Out-Null
$json = ConvertTo-Json @($map.Values) -Compress -Depth 3
[IO.File]::WriteAllText("$PSScriptRoot\out\catalog.raw.json", $json, [Text.UTF8Encoding]::new($false))
Write-Host "DONE: $($map.Count) songs (added $($stats.added), upgraded $($stats.upgraded), versions rejected $($stats.versions))"
