param([int]$MaxYear = 9999, [int]$MinTrackSec = 150, [switch]$SkipArtists)
$ErrorActionPreference = 'Stop'
# Iconic Hindi films: every soundtrack song counts as famous; film year is authoritative
$movies = @(
    'Awara|1951','Shree 420|1955','Pyaasa|1957','Chalti Ka Naam Gaadi|1958','Kaagaz Ke Phool|1959',
    'Mughal-e-Azam|1960','Guide|1965','Teesri Manzil|1966','Jewel Thief|1967','Padosan|1968',
    'Aradhana|1969','Anand|1971','Kati Patang|1971','Hare Rama Hare Krishna|1971','Amar Prem|1972',
    'Pakeezah|1972','Bobby|1973','Abhimaan|1973','Yaadon Ki Baaraat|1973','Sholay|1975',
    'Deewaar|1975','Kabhi Kabhie|1976','Amar Akbar Anthony|1977','Hum Kisise Kum Naheen|1977','Don|1978',
    'Muqaddar Ka Sikandar|1978','Golmaal|1979','Qurbani|1980','Karz|1980','Silsila|1981',
    'Umrao Jaan|1981','Kudrat|1981','Disco Dancer|1982','Namak Halaal|1982','Hero|1983',
    'Sharaabi|1984','Ram Teri Ganga Maili|1985','Mr. India|1987','Ijaazat|1987','Tezaab|1988',
    'Qayamat Se Qayamat Tak|1988','Chandni|1989','Maine Pyar Kiya|1989',
    'Aashiqui|1990','Dil|1990','Saajan|1991','Sadak|1991','Dil Hai Ki Manta Nahin|1991',
    'Deewana|1992','Jo Jeeta Wohi Sikandar|1992','Baazigar|1993','Darr|1993','Khalnayak|1993',
    'Hum Hain Rahi Pyar Ke|1993','Hum Aapke Hain Koun|1994','1942 A Love Story|1994','Mohra|1994',
    'Dilwale Dulhania Le Jayenge|1995','Rangeela|1995','Raja Hindustani|1996','Dil To Pagal Hai|1997',
    'Pardes|1997','Border|1997','Judwaa|1997','Ishq|1997','Dil Se|1998','Kuch Kuch Hota Hai|1998',
    'Soldier|1998','Jab Pyar Kisise Hota Hai|1998','Taal|1999','Hum Dil De Chuke Sanam|1999',
    'Sarfarosh|1999','Biwi No. 1|1999','Kaho Naa Pyaar Hai|2000','Mohabbatein|2000','Dhadkan|2000',
    'Josh|2000','Kabhi Khushi Kabhie Gham|2001','Dil Chahta Hai|2001','Lagaan|2001',
    'Rehnaa Hai Terre Dil Mein|2001','Devdas|2002','Raaz|2002','Kal Ho Naa Ho|2003','Tere Naam|2003',
    'Koi Mil Gaya|2003','Main Hoon Na|2004','Veer-Zaara|2004','Dhoom|2004','Murder|2004',
    'Swades|2004','Hum Tum|2004','Mujhse Shaadi Karogi|2004','Bunty Aur Babli|2005',
    'Salaam Namaste|2005','Aashiq Banaya Aapne|2005','Kabhi Alvida Naa Kehna|2006',
    'Rang De Basanti|2006','Gangster|2006','Fanaa|2006','Lage Raho Munna Bhai|2006','Krrish|2006',
    'Dhoom 2|2006','Woh Lamhe|2006','Om Shanti Om|2007','Jab We Met|2007','Chak De India|2007',
    'Taare Zameen Par|2007','Namastey London|2007','Life in a Metro|2007','Partner|2007',
    'Welcome|2007','Bhool Bhulaiyaa|2007','Saawariya|2007','Guru|2007','Awarapan|2007',
    'Jodhaa Akbar|2008','Rock On|2008','Jaane Tu Ya Jaane Na|2008','Rab Ne Bana Di Jodi|2008',
    'Ghajini|2008','Dostana|2008','Singh Is Kinng|2008','Bachna Ae Haseeno|2008','Race|2008',
    'Jannat|2008','Love Aaj Kal|2009','Wake Up Sid|2009','3 Idiots|2009',
    'Ajab Prem Ki Ghazab Kahani|2009','Dev.D|2009','Kaminey|2009','Wanted|2009','Delhi-6|2009',
    'Dabangg|2010','Once Upon a Time in Mumbaai|2010','Band Baaja Baaraat|2010',
    'Anjaana Anjaani|2010','My Name Is Khan|2010','Tees Maar Khan|2010',
    'Zindagi Na Milegi Dobara|2011','Rockstar|2011','Ra.One|2011','Bodyguard|2011',
    'The Dirty Picture|2011','Mere Brother Ki Dulhan|2011','Tanu Weds Manu|2011','Barfi!|2012',
    'Ek Tha Tiger|2012','Cocktail|2012','Agneepath|2012','Student of the Year|2012',
    'Jab Tak Hai Jaan|2012','Rowdy Rathore|2012','Aashiqui 2|2013','Yeh Jawaani Hai Deewani|2013',
    'Chennai Express|2013','Goliyon Ki Raasleela Ram-Leela|2013','Raanjhanaa|2013','Kai Po Che|2013',
    'Dhoom 3|2013','Bhaag Milkha Bhaag|2013','2 States|2014','Queen|2014',
    'Humpty Sharma Ki Dulhania|2014','Kick|2014','Happy New Year|2014','Ek Villain|2014',
    'Highway|2014','PK|2014','Bajrangi Bhaijaan|2015','Dilwale|2015','Bajirao Mastani|2015',
    'Tamasha|2015','Hamari Adhuri Kahani|2015','Dil Dhadakne Do|2015','ABCD 2|2015',
    'Prem Ratan Dhan Payo|2015','Ae Dil Hai Mushkil|2016','Sanam Teri Kasam|2016',
    'Kapoor & Sons|2016','Sultan|2016','Dangal|2016','Befikre|2016','Badrinath Ki Dulhania|2017',
    'Half Girlfriend|2017','Jab Harry Met Sejal|2017','Tiger Zinda Hai|2017','Raees|2017',
    'Golmaal Again|2017','Padmaavat|2018','Sonu Ke Titu Ki Sweety|2018','Stree|2018','Simmba|2018',
    'Kedarnath|2018','Raazi|2018','Veere Di Wedding|2018','Dhadak|2018','Kabir Singh|2019',
    'Gully Boy|2019','War|2019','Kalank|2019','Bharat|2019','Luka Chuppi|2019',
    'Pati Patni Aur Woh|2019','Kesari|2019','Street Dancer 3D|2020','Shershaah|2021',
    'Atrangi Re|2021','Sooryavanshi|2021','Tadap|2021','Gangubai Kathiawadi|2022',
    'Brahmastra|2022','Bhool Bhulaiyaa 2|2022','Jugjugg Jeeyo|2022',
    'Rocky Aur Rani Kii Prem Kahaani|2023','Pathaan|2023','Jawan|2023','Animal|2023',
    'Tu Jhoothi Main Makkaar|2023','Satyaprem Ki Katha|2023','Zara Hatke Zara Bachke|2023',
    'Dunki|2023','Tiger 3|2023','Fighter|2024','Teri Baaton Mein Aisa Uljha Jiya|2024','Crew|2024',
    'Stree 2|2024','Bad Newz|2024','Bhool Bhulaiyaa 3|2024','Vicky Vidya Ka Woh Wala Video|2024',
    'Mr. & Mrs. Mahi|2024','Laapataa Ladies|2024','Chandu Champion|2024','Saiyaara|2025',
    'Chhaava|2025','Sky Force|2025','Raid 2|2025','Housefull 5|2025','Sitaare Zameen Par|2025',
    'Metro In Dino|2025','Dhadak 2|2025','Param Sundari|2025','War 2|2025','Thamma|2025',
    'Ek Deewane Ki Deewaniyat|2025','Sunny Sanskari Ki Tulsi Kumari|2025','Dhurandhar|2025'
)
# More famous voices/composers: their top-ranked tracks count as famous
$artists = @(
    'lucky ali', 'abhijeet bhattacharya', 'hariharan', 'shankar mahadevan', 'sukhwinder singh',
    'mika singh', 'benny dayal', 'kailash kher', 'neeti mohan', 'papon', 'ankit tiwari',
    'mithoon', 'tanishk bagchi', 'salim sulaiman', 'ajay atul', 'laxmikant pyarelal',
    'shankar jaikishan', 's d burman', 'madan mohan', 'o p nayyar', 'bappi lahiri',
    'anand milind', 'rajesh roshan', 'sajid wajid', 'amaal mallik', 'ismail darbar',
    'raghav chaitanya', 'shalmali kholgade', 'nikhita gandhi', 'geeta dutt', 'hemant kumar',
    'talat mahmood', 'suresh wadkar', 'shabbir kumar', 'kumar sanu alka yagnik'
)
$southEx = 'Tamil|Telugu|Kollywood|Tollywood|Malayalam|Kannada|Bhojpuri|Marathi|Bengali|Gujarati|Odia|Assamese|South'
$junkRx = 'Instrumental|Karaoke|Dialogue|Theme|Interlude|Mashup|Jukebox|Medley|Narration|Promo|Story|Scene'
$scoreRx = 'John Stewart Eduri|Harshavardhan Rameshwar|Sanchit Balhara|Ketan Sodha|Hitesh Sonik|Julius Packiam|Simaab Sen|Prasad Sashte|Joel Crasto|Amar Mohile'
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
function CleanName($tn) {
    $n = $tn -replace '\s*[\(\[](From|Original|Remastered|Version|Revival|Jhankar|Lofi|LoFi|Slowed|Remix|Club|Unplugged|Reprise|Female|Male|Duet|Live|Feat|feat|Bonus|Deluxe|Single|Radio|Edit|Mono|Stereo|Acoustic)[^\)\]]*[\)\]]', ''
    return ($n -replace '\s*-\s*(Remastered|Remaster|Live|Single Version|Radio Edit|Mono|Stereo|Acoustic).*$', '').Trim()
}
function DupKey($lang, $name) { return $lang + (($name.ToLower()) -replace '(,?\s*(pt|part)\.?\s*\d+)', '' -replace '[^a-z0-9]', '') }

# load existing catalog
$base = Get-Content "C:\Users\Vansh\Desktop\c++ dsa\bollywood-songspot\data\songs.json" -Raw | ConvertFrom-Json
$map = [ordered]@{}
foreach ($s in $base) {
    $k = DupKey $s.l $s.t
    if ($map.Contains($k)) { $k = $k + '|' + (N $s.m) + $s.y }
    if (-not $map.Contains($k)) { $map[$k] = $s }
}
$startCount = $map.Count
$added = 0; $upgraded = 0

function Merge($entry) {
    $k = DupKey $entry.l $entry.t
    if ($map.Contains($k)) {
        $old = $map[$k]
        # Bollywood reuses titles: a different film or a far-apart year means a different song
        $diffFilm = $old.m -and $entry.m -and ((N $old.m) -ne (N $entry.m))
        $diffYear = $old.y -gt 0 -and $entry.y -gt 0 -and [math]::Abs($old.y - $entry.y) -gt 3
        if ($diffFilm -or $diffYear) {
            $k2 = $k + '|' + (N $entry.m) + $entry.y
            if (-not $map.Contains($k2)) { $map[$k2] = $entry; $script:added++ }
            return
        }
        if ($entry.f -eq 1 -and $old.f -ne 1) { $old.f = 1; $script:upgraded++ }
        if ($entry.m -and -not $old.m) { $old.m = $entry.m }
        if ($entry.y -gt 0 -and ($old.y -le 0 -or $old.y -gt $entry.y)) { $old.y = $entry.y }
    } else { $map[$k] = $entry; $script:added++ }
}

function Get-Itunes($term) {
    $url = 'https://itunes.apple.com/search?term=' + [uri]::EscapeDataString($term) + '&country=IN&media=music&entity=song&limit=200'
    for ($i = 0; $i -lt 3; $i++) {
        try { return Invoke-RestMethod -Uri $url -TimeoutSec 30 }
        catch { Write-Host "  retry ($term): $($_.Exception.Message)"; Start-Sleep -Seconds (10 * ($i + 1)) }
    }
    return $null
}

foreach ($mv in $movies) {
    $title, $yr = $mv.Split('|'); $yr = [int]$yr
    if ($yr -gt $MaxYear) { continue }
    $want = N $title
    $r = Get-Itunes $title
    if (-not $r) { Write-Host "FAILED movie: $title"; continue }
    $kept = 0
    foreach ($t in $r.results) {
        if (-not $t.previewUrl) { continue }
        if ($t.primaryGenreName -notmatch '^(Bollywood|Filmi|Indian Pop|Sufi|Ghazal|Hindi Pop|Soundtrack)$') { continue }
        if ("$($t.collectionName) $($t.trackName)" -match $southEx) { continue }
        if ($t.trackName -match $junkRx) { continue }
        if ($t.trackName -match '(?i)remix|lofi|lo-fi|jhankar|slowed|reverb|pocket cinema|making of|reprise|revisited|cover|unplugged|version') { continue }
        # background-score cues: short, often exclamatory, credited to the score composer
        if ($t.trackTimeMillis -and $t.trackTimeMillis -lt ($MinTrackSec * 1000)) { continue }
        if ($t.trackName.Trim().EndsWith('!')) { continue }
        if ($t.artistName -match $scoreRx) { continue }
        # story/dialogue tracks credit the whole cast
        if (@($t.artistName -split ',|&').Count -ge 6) { continue }
        # same-named remakes and later compilations: release must sit near the film's year
        if ($t.releaseDate) {
            $ry = [int]([datetime]$t.releaseDate).Year
            if ($ry -lt $yr - 1 -or $ry -gt $yr + 2) { continue }
        }
        $coll = ($t.collectionName -replace '\s*[\(\[].*?[\)\]]', '')
        $coll = ($coll -split '\s+-\s+|:')[0]
        $fromOk = $false
        if ($t.trackName -match "From [`"']([^`"']+)[`"']") { $fromOk = ((N $Matches[1]) -eq $want) }
        if (-not $fromOk -and (N $coll) -ne $want) { continue }
        $name = CleanName $t.trackName
        if (($name -replace '[^a-zA-Z0-9]', '').Length -lt 3) { continue }
        $e = [pscustomobject]@{
            t = $name; a = $t.artistName; m = $title; y = $yr
            p = $t.previewUrl; art = ($t.artworkUrl100 -replace '100x100', '300x300')
            c = 'b'; l = 'hi'; f = 1
        }
        Merge $e; $kept++
    }
    Write-Host "movie/$title ($yr) -> $kept tracks (added $added, upgraded $upgraded)"
    Start-Sleep -Seconds 3
}

foreach ($q in $(if ($SkipArtists) { @() } else { $artists })) {
    $r = Get-Itunes $q
    if (-not $r) { Write-Host "FAILED artist: $q"; continue }
    $kept = 0; $rank = -1
    foreach ($t in $r.results) {
        $rank++
        if (-not $t.previewUrl) { continue }
        if ($t.primaryGenreName -notmatch '^(Bollywood|Filmi|Indian Pop|Sufi|Ghazal|Hindi Pop)$') { continue }
        if ("$($t.collectionName) $($t.trackName)" -match $southEx) { continue }
        if ($t.trackName -match $junkRx) { continue }
        if ($t.trackTimeMillis -and $t.trackTimeMillis -lt 120000) { continue }
        if ($t.artistName -match $scoreRx) { continue }
        $isVersion = $t.trackName -match 'Jhankar|Lofi|LoFi|Slowed|Remix|Revival|Rewind|Redux|Cover|Unplugged|Reprise|Mashup'
        if ($isVersion -and $rank -ge 30) { continue }
        $name = CleanName $t.trackName
        if (($name -replace '[^a-zA-Z0-9]', '').Length -lt 3) { continue }
        $year = 0
        if ($t.releaseDate) { $year = [int]([datetime]$t.releaseDate).Year }
        foreach ($ec in $eraCaps) { if ($t.artistName -match $ec.rx -and $year -gt $ec.cap) { $year = $ec.cap } }
        $movie = ''
        if ($t.trackName -match "From [`"']([^`"']+)[`"']") { $movie = $Matches[1] }
        elseif ($t.collectionName -match "^([^\(]+?)\s*\((Original|Motion)") { $movie = $Matches[1].Trim() }
        $e = [pscustomobject]@{
            t = $name; a = $t.artistName; m = $movie; y = $year
            p = $t.previewUrl; art = ($t.artworkUrl100 -replace '100x100', '300x300')
            c = 'b'; l = 'hi'; f = [int]($rank -lt 30)
        }
        Merge $e; $kept++
    }
    Write-Host "artist/$q -> $kept tracks (added $added, upgraded $upgraded)"
    Start-Sleep -Seconds 3
}

$out = @($map.Values) | Sort-Object y
$json = ConvertTo-Json $out -Compress -Depth 3
[IO.File]::WriteAllText("C:\Users\Vansh\Desktop\c++ dsa\bollywood-songspot\data\songs.json", $json, [Text.UTF8Encoding]::new($false))
$fb = @($out | Where-Object { $_.c -eq 'b' -and $_.f -eq 1 }).Count
$tb = @($out | Where-Object { $_.c -eq 'b' }).Count
Write-Host "DONE: $startCount -> $($map.Count) songs. Added $added, upgraded-to-famous $upgraded. Bollywood $tb (famous $fb)."
