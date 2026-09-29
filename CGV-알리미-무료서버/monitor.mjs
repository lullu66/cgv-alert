import fs from 'node:fs/promises';
import {configuration,candidates,record,messages,telegram,core} from './logic.mjs';
import {scan,AccessBlocked} from './scanner.mjs';
import {runBatch} from './batch.mjs';
const path='.state/state.json';
await fs.mkdir('.state',{recursive:true});
let state={entries:{}};
try{state=JSON.parse(await fs.readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw Error('저장된 알림 기록이 손상되었습니다. 기록을 확인해 주세요.');}
const save=()=>fs.writeFile(path,JSON.stringify(state));
async function main(index) {
  if(index===0&&process.env.RESET_BLOCK==='true'){delete state.halted;await save();}
  if(state.halted){console.log('접근 제한으로 일시 중지되어 있습니다. README의 재개 절차를 확인하세요.');return false;}
  const config=configuration();
  if(!config.days.length){console.log('지정한 감시 기간이 끝났습니다.');return false;}
  if(!process.env.TELEGRAM_BOT_TOKEN||!process.env.TELEGRAM_CHAT_ID)throw Error('텔레그램 Secrets를 먼저 설정해 주세요.');
  if(index===0&&process.env.SEND_TEST==='true')await telegram('🎬 치이카와 CGV 알리미 연결 완료!\n이 메시지는 연결 테스트입니다. 실제 시간표 확인 결과는 별도로 전달합니다.');
  console.log(`확인 ${index+1}/5 시작 · ${new Date().toISOString()}`);
  await scan(config.days,async(date,rows)=>{
    const fresh=candidates(rows,config,state);
    // Persist after each delivered chunk; a failed delivery is never marked as sent.
    for(const chunk of messages(fresh)) {await telegram(chunk.text);record(chunk.rows,config,state,chunk.rows);await save();}
    record(rows,config,state);state.lastSuccess=new Date().toISOString();delete state.lastError;await save();
    console.log(`${date}: 시간표 확인 완료 · 조건에 맞는 새 알림 ${fresh.length}개`);
  });
}
try{await runBatch(main);}
catch(e) {
  const blocked=e instanceof AccessBlocked;
  if(blocked)state.halted=true;
  state.lastError=blocked?'CGV 접근 제한':'조회 또는 알림 전송 실패';
  // Generic log/error message prevents browser or Telegram URLs from exposing secrets.
  console.error(state.lastError+' — GitHub의 실행 요약과 CGV 공식 페이지를 확인하세요.');
  if(!state.lastErrorNotice||Date.now()-state.lastErrorNotice>21600000) {
    try {await telegram(blocked?'⚠️ CGV가 서버 접속을 제한하여 감시를 중지했습니다. 좌석 없음으로 처리하지 않았습니다. GitHub Actions 안내를 확인해 주세요.':'⚠️ CGV 알리미 확인에 실패했습니다. 새 좌석을 확인하지 못한 상태이며 다음 예약 실행에서 재시도합니다.');state.lastErrorNotice=Date.now();}catch{console.error('오류 알림도 전송되지 않았습니다. Telegram Secrets를 확인해 주세요.');}
  }
  await save();process.exitCode=1;
}
finally {
  if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,`## CGV 알리미\n\n- 상태: ${state.halted?'접속 제한으로 중지':process.exitCode?'이번 확인 실패':'실행 완료'}\n- 마지막 정상 조회: ${state.lastSuccess||'아직 없음'}\n- GPT/API 호출: 사용하지 않음\n- PC가 꺼져 있어도 GitHub 예약 실행으로 동작합니다.\n`);
}
