$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
try {
    Write-Host '먼저 새로 만든 본인 봇의 대화창에서 Start를 누르고 메시지를 보내세요.'
    Write-Host '토큰은 공식 Telegram API로만 전송되며 파일에 저장하지 않습니다.'
    $secret = Read-Host 'BotFather가 준 토큰 (입력해도 화면에 표시되지 않음)' -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    try { $botToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
    if ($botToken -notmatch '^\d+:[A-Za-z0-9_-]+$') { throw '토큰 형식을 확인해 주세요.' }
    $response = Invoke-RestMethod -Method Post -Uri ('https://api.telegram.org/bot' + $botToken + '/getUpdates') -ContentType 'application/json' -Body '{"limit":100,"timeout":0}' -TimeoutSec 20
    if (-not $response.ok) { throw 'Telegram 조회에 실패했습니다.' }
    $chats = @($response.result | ForEach-Object { $_.message.chat } | Where-Object { $_.type -eq 'private' } | Sort-Object id -Unique)
    if ($chats.Count -eq 0) {
        Write-Host '개인 메시지가 없습니다. 봇 대화창에서 Start 후 새 메시지를 보내고 다시 실행하세요.'
    } else {
        Write-Host '본인의 이름을 확인하고 해당 ID를 TELEGRAM_CHAT_ID Secret에 저장하세요.'
        $chats | Select-Object @{Name='이름';Expression={$_.first_name}}, @{Name='사용자명';Expression={$_.username}}, @{Name='채팅 ID';Expression={$_.id}} | Format-Table
    }
} catch {
    Write-Host '연결하지 못했습니다. 인터넷 연결, 토큰, 봇 Start 여부를 확인하세요.' -ForegroundColor Yellow
} finally {
    $botToken = $null
    if ($secret) { $secret.Dispose() }
    Read-Host 'Enter를 누르면 닫힙니다'
}
