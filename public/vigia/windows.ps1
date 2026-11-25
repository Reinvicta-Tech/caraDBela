# CaraDBela: vigia para Windows. Corre com a tua conta, sem administrador.
#   -Instalar   pede a chave, guarda-a cifrada e arranca com a tua sessao
#   -Remover    para a vigia e apaga tudo o que instalou
# So envia: um sinal de vida por minuto, bloqueio, desbloqueio, sessoes remotas e, se a tua
# conta puder ler o registo de seguranca, palavras-passe erradas. Nunca le palavras-passe.
param(
  [switch]$Instalar, [switch]$Remover, [switch]$NoArranque,
  [string]$Servidor, [string]$Chave,
  [string]$Pasta = (Join-Path $env:LOCALAPPDATA 'CaraDBela'),
  [string]$Arranque = [Environment]::GetFolderPath('Startup'),
  [int]$Pulso = 60
)
$ErrorActionPreference = 'Stop'
$eu = Join-Path $Pasta 'vigia.ps1'
$ficheiro = Join-Path $Pasta 'vigia.json'
$atalho = Join-Path $Arranque 'CaraDBela vigia.lnk'
$powershell = Join-Path $PSHOME 'powershell.exe'
$argumentos = "-NoProfile -MTA -WindowStyle Minimized -File `"$eu`""

function Get-Nome([string]$texto) {
  $sha = [Security.Cryptography.SHA256]::Create()
  'CaraDBela-' + [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($texto.ToLower()))).Replace('-', '').Substring(0, 16)
}
$nome = Get-Nome $Pasta

if ($Remover) {
  Remove-Item $atalho -ErrorAction SilentlyContinue
  $pidFicheiro = Join-Path $Pasta 'vigia.pid'
  if (Test-Path $pidFicheiro) {
    $id = [int](Get-Content $pidFicheiro)
    # O numero pode ter sido reutilizado por outro programa: confirma que e mesmo a vigia.
    $p = Get-CimInstance Win32_Process -Filter "ProcessId = $id" -ErrorAction SilentlyContinue
    if ($p -and $p.CommandLine -and $p.CommandLine.Contains($eu)) { Stop-Process -Id $id -ErrorAction SilentlyContinue }
  }
  foreach ($f in 'vigia.ps1', 'vigia.json', 'vigia.pid') { Remove-Item (Join-Path $Pasta $f) -ErrorAction SilentlyContinue }
  Write-Host 'Vigia removida. Podes tambem remover a chave na CaraDBela.'
  return
}

if ($Instalar) {
  if ($Servidor -notmatch '^https?://[^\s/]+$') { throw 'Indica o endereco da CaraDBela, por exemplo: -Servidor http://127.0.0.1:3000' }
  $segura = if ($Chave) { ConvertTo-SecureString $Chave -AsPlainText -Force } else { Read-Host 'Cola a chave de eventos' -AsSecureString }
  $clara = (New-Object Net.NetworkCredential('', $segura)).Password
  if ($clara -notmatch '^cdb_[0-9a-f]{48}$') { throw 'Isso nao parece uma chave de eventos. Comeca por cdb_' }
  New-Item -ItemType Directory -Force $Pasta | Out-Null
  if ($PSCommandPath -ne $eu) { Copy-Item $PSCommandPath $eu -Force }
  # ConvertFrom-SecureString cifra com a conta do Windows: so esta conta, neste PC, a consegue ler.
  @{ servidor = $Servidor; chave = (ConvertFrom-SecureString $segura) } | ConvertTo-Json | Set-Content $ficheiro -Encoding UTF8
  $s = (New-Object -ComObject WScript.Shell).CreateShortcut($atalho)
  $s.TargetPath = $powershell
  $s.Arguments = "$argumentos -Pasta `"$Pasta`" -NoArranque"
  $s.WindowStyle = 7
  $s.Description = 'CaraDBela: vigia deste computador'
  $s.Save()
  Start-Process $powershell -ArgumentList "$argumentos -Pasta `"$Pasta`"" -WindowStyle Minimized
  Write-Host 'Vigia instalada. Fica minimizada na barra de tarefas e arranca quando inicias sessao.'
  Write-Host "Para remover: powershell -File `"$eu`" -Remover"
  return
}

if (-not (Test-Path $ficheiro)) { throw 'A vigia nao esta instalada. Usa -Instalar.' }
$config = Get-Content $ficheiro -Raw -Encoding UTF8 | ConvertFrom-Json
$clara = (New-Object Net.NetworkCredential('', (ConvertTo-SecureString $config.chave))).Password
$unica = New-Object Threading.Mutex($false, $nome)
try { if (-not $unica.WaitOne(0)) { Write-Host 'A vigia ja esta a correr.'; return } } catch [Threading.AbandonedMutexException] { }
Set-Content (Join-Path $Pasta 'vigia.pid') $PID
try { $Host.UI.RawUI.WindowTitle = 'CaraDBela vigia' } catch { }

function Send-Aviso([string]$caminho, $corpo) {
  try {
    $bytes = [Text.Encoding]::UTF8.GetBytes(($corpo | ConvertTo-Json -Compress))
    Invoke-RestMethod -Method Post -Uri "$($config.servidor)$caminho" -Headers @{ Authorization = "Bearer $clara" } -ContentType 'application/json' -Body $bytes -TimeoutSec 5 | Out-Null
    $true
  } catch {
    $codigo = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
    $porque = switch ($codigo) {
      0 { 'nao responde. Confirma que esta a correr.' }
      401 { 'a chave foi substituida ou removida. Instala outra vez com a chave nova.' }
      { $_ -in 403, 404 } { 'esta a correr uma versao antiga. Para-a e arranca-a outra vez.' }
      default { "erro $codigo." }
    }
    Write-Host "$(Get-Date -Format HH:mm:ss) nao consegui avisar a CaraDBela: $porque"
    $false
  }
}
function Send-Evento([string]$tipo, [string]$detalhe, [string]$ip) {
  $corpo = @{ tipo = $tipo; detalhe = $detalhe }
  $lido = $null
  if ($ip -and [Net.IPAddress]::TryParse($ip, [ref]$lido) -and -not [Net.IPAddress]::IsLoopback($lido)) { $corpo.origemIp = $ip }
  Write-Host "$(Get-Date -Format HH:mm:ss) $tipo $detalhe"
  Send-Aviso '/api/receber' $corpo | Out-Null
}
# O ficheiro so tem ASCII, para o PowerShell 5.1 o ler bem em qualquer PC.
$sessaoTxt = 'Sess' + [char]0xE3 + 'o'
$SESSAO = @{
  SessionLock = @('ligacao', 'Computador bloqueado'); SessionUnlock = @('login_ok', 'Computador desbloqueado')
  SessionLogon = @('login_ok', "$sessaoTxt iniciada"); RemoteConnect = @('login_ok', "$sessaoTxt remota ligada")
  RemoteDisconnect = @('ligacao', "$sessaoTxt remota desligada")
}

function Get-Falhas([DateTime]$desde) {
  try { @(Get-WinEvent -FilterHashtable @{ LogName = 'Security'; Id = 4625; StartTime = $desde } -ErrorAction Stop) }
  catch { if ($_.FullyQualifiedErrorId -like 'NoMatchingEventsFound*') { @() } else { throw } }
}
$ultimo = 0
$desde = Get-Date
$falhas = $true
# Sem esta leitura direta, "sem eventos" e "sem permissao" podem confundir-se.
try { Get-WinEvent -LogName Security -MaxEvents 1 -ErrorAction Stop | Out-Null } catch { $falhas = $false }

Register-ObjectEvent -InputObject ([Microsoft.Win32.SystemEvents]) -EventName SessionSwitch -SourceIdentifier CaraDBela | Out-Null
Write-Host 'CaraDBela: a vigiar este computador. Fecha esta janela para parar.'
if (-not $falhas) { Write-Host 'As palavras-passe erradas nao sao vigiadas: esta conta nao pode ler o registo de seguranca.' }
try {
  if ($NoArranque) { Start-Sleep 5; Send-Evento 'login_ok' "$sessaoTxt iniciada" }
  $proximo = [DateTime]::MinValue
  while ($true) {
    if ((Get-Date) -ge $proximo) {
      Send-Aviso '/api/receber/vivo' @{ falhas = $falhas } | Out-Null
      $proximo = (Get-Date).AddSeconds($Pulso)
    }
    $e = Wait-Event -SourceIdentifier CaraDBela -Timeout 10
    while ($e) {
      $que = $SESSAO["$($e.SourceEventArgs.Reason)"]
      Remove-Event -EventIdentifier $e.EventIdentifier
      if ($que) { Send-Evento $que[0] $que[1] }
      $e = Get-Event -SourceIdentifier CaraDBela -ErrorAction SilentlyContinue | Select-Object -First 1
    }
    if ($falhas) {
      try {
        foreach ($f in (Get-Falhas $desde | Where-Object { $_.RecordId -gt $ultimo } | Sort-Object RecordId)) {
          $ultimo = $f.RecordId
          $x = @{}
          ([xml]$f.ToXml()).Event.EventData.Data | ForEach-Object { $x[$_.Name] = $_.'#text' }
          # 4 e 5 sao tarefas e servicos, nao pessoas.
          if ($x.LogonType -notin '4', '5') { Send-Evento 'login_falhado' 'Palavra-passe errada no Windows' $x.IpAddress }
        }
      } catch { Write-Host "Registo de seguranca: $($_.Exception.Message)"; $falhas = $false }
    }
  }
} finally {
  Unregister-Event -SourceIdentifier CaraDBela -ErrorAction SilentlyContinue
  Remove-Item (Join-Path $Pasta 'vigia.pid') -ErrorAction SilentlyContinue
  $unica.ReleaseMutex()
}
