# Primo Giocatore - copia di sicurezza del database sul PC
# v1.0.0 - 202611231930
# Si lancia con un doppio clic su backup-database.bat (stessa cartella).
# Salva in C:\Backup\PrimoGiocatore (fuori da OneDrive e fuori dal progetto:
# contiene dati personali, non va su GitHub ne' in cloud):
#   AAAA-MM-GG_HHMM-dati.dump     tutte le tabelle, funzioni e regole (schema public)
#   AAAA-MM-GG_HHMM-account.dump  gli account (auth.users e auth.identities)
#   AAAA-MM-GG_HHMM-lavori.csv    i lavori programmati (pg_cron)
# Tiene le ultime 12 copie e cancella quelle piu' vecchie.
# La password del database la chiede ogni volta e non la salva da nessuna parte.

$ErrorActionPreference = 'Stop'
$cartella = 'C:\Backup\PrimoGiocatore'
$tieni = 12

function Write-Passo($testo) { Write-Host ''; Write-Host "== $testo" -ForegroundColor Cyan }
function Stop-ConErrore($testo) { Write-Host ''; Write-Host $testo -ForegroundColor Red; exit 1 }

# 1. Gli strumenti di PostgreSQL (pg_dump, psql, pg_restore) ------------------
function Find-Strumento($nome) {
  $c = Get-Command $nome -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  $trovati = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\$nome.exe" -ErrorAction SilentlyContinue |
    Sort-Object { [int]($_.Directory.Parent.Name -replace '\D', '') } -Descending
  if ($trovati) { return $trovati[0].FullName }
  return $null
}
$pgdump = Find-Strumento 'pg_dump'
$psql = Find-Strumento 'psql'
$pgrestore = Find-Strumento 'pg_restore'
if (-not $pgdump -or -not $psql -or -not $pgrestore) {
  Stop-ConErrore ("Mancano gli strumenti di PostgreSQL (pg_dump).`n" +
    "Installali una volta sola da PowerShell con:`n" +
    "  winget install --id PostgreSQL.PostgreSQL.17 --override `"--mode unattended --disable-components server,pgAdmin,stackbuilder`"`n" +
    "poi rilancia il backup.")
}
Write-Host "Uso $pgdump"

# 2. Dove sta il database (senza password) ------------------------------------
New-Item -ItemType Directory -Force $cartella | Out-Null
$fileCollegamento = Join-Path $cartella 'collegamento.txt'
if (-not (Test-Path $fileCollegamento)) {
  Write-Host ''
  Write-Host 'Prima volta: serve il collegamento al database.'
  Write-Host 'In Supabase: tasto "Connect" in alto -> "Session pooler" -> copia la riga che inizia con postgresql://'
  $riga = Read-Host 'Incollala qui'
  $m = [regex]::Match($riga.Trim(), '^postgres(?:ql)?://([^:@/]+)(?::[^@]*)?@([^:/?]+)(?::(\d+))?/([^?\s]+)')
  if (-not $m.Success) { Stop-ConErrore 'Non riconosco il collegamento: deve iniziare con postgresql://' }
  $porta = if ($m.Groups[3].Success) { $m.Groups[3].Value } else { '5432' }
  # Si salva tutto tranne la password.
  @("utente=$($m.Groups[1].Value)", "server=$($m.Groups[2].Value)", "porta=$porta", "database=$($m.Groups[4].Value)") |
    Set-Content -Encoding ascii $fileCollegamento
  Write-Host "Salvato in $fileCollegamento (senza password)."
}
$conf = @{}
Get-Content $fileCollegamento | ForEach-Object { $k, $v = $_ -split '=', 2; if ($k) { $conf[$k.Trim()] = $v.Trim() } }
$base = @('-h', $conf.server, '-p', $conf.porta, '-U', $conf.utente, '-d', $conf.database)

# 3. La password, solo per questa volta ----------------------------------------
$sicura = Read-Host 'Password del database (quella di Supabase, non si vede mentre scrivi)' -AsSecureString
$env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sicura))
$env:PGSSLMODE = 'require'

try {
  $data = Get-Date -Format 'yyyy-MM-dd_HHmm'
  $dati = Join-Path $cartella "$data-dati.dump"
  $account = Join-Path $cartella "$data-account.dump"
  $lavori = Join-Path $cartella "$data-lavori.csv"

  Write-Passo 'Tabelle, funzioni e regole (qualche minuto)'
  & $pgdump @base -n public -Fc -f $dati
  if ($LASTEXITCODE -ne 0) { Stop-ConErrore 'Copia delle tabelle NON riuscita (vedi il messaggio sopra).' }

  Write-Passo 'Account'
  & $pgdump @base --data-only -t auth.users -t auth.identities -Fc -f $account
  if ($LASTEXITCODE -ne 0) { Stop-ConErrore 'Copia degli account NON riuscita (vedi il messaggio sopra).' }

  Write-Passo 'Lavori programmati'
  $dest = $lavori -replace '\\', '/'
  & $psql @base -q -c "\copy (select jobname, schedule, command, active from cron.job order by jobname) to '$dest' with csv header"
  if ($LASTEXITCODE -ne 0) { Write-Host 'Lavori programmati non copiati: non e'' grave, il resto c''e''.' -ForegroundColor Yellow }

  # 4. Controllo: i file si rileggono e quante cose contengono -----------------
  Write-Passo 'Controllo'
  $voci = (& $pgrestore --list $dati | Where-Object { $_ -notmatch '^;' -and $_.Trim() }).Count
  $tabelle = (& $pgrestore --list $dati | Where-Object { $_ -match ' TABLE DATA ' }).Count
  if ($LASTEXITCODE -ne 0 -or $tabelle -lt 10) { Stop-ConErrore 'La copia delle tabelle sembra incompleta.' }
  $mb = { param($f) '{0:N1} MB' -f ((Get-Item $f).Length / 1MB) }
  Write-Host ("Tabelle con dati: $tabelle   (voci in tutto: $voci)   " + (& $mb $dati))
  Write-Host ('Account: ' + (& $mb $account))

  # 5. Solo le ultime copie -------------------------------------------------------
  foreach ($tipo in '-dati.dump', '-account.dump', '-lavori.csv') {
    Get-ChildItem $cartella -Filter "*$tipo" | Sort-Object Name -Descending |
      Select-Object -Skip $tieni | Remove-Item -Confirm:$false
  }

  Write-Host ''
  Write-Host "Fatto. Copia salvata in $cartella" -ForegroundColor Green
}
finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
