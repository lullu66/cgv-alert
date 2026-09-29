import {createHash} from 'node:crypto';
import core from './core.cjs';
export {core};
export const THEATRE_URL='https://cgv.co.kr/cnm/bzplcCgv/0013001';
export function configuration(env=process.env) {
  const start=env.START_DATE||core.today();
  const end=env.END_DATE||core.addDays(start,6);
  const days=core.dates(start,end).filter(d=>d>=core.today());
  const minSeats=Number(env.MIN_SEATS||2);
  if(!Number.isInteger(minSeats)||minSeats<1||minSeats>1000)throw Error('MIN_SEATS는 1~1000의 정수여야 합니다.');
  const keyword=(env.MOVIE_KEYWORD||'치이카와').trim();
  if(!keyword)throw Error('영화 검색어가 비어 있습니다.');
  return {keyword,minSeats,days};
}
export const identity=row=>createHash('sha256').update(core.key(row)).digest('hex');
export function candidates(rows,config,state,now=Date.now()) {
  return rows.filter(row=>{
    if(!core.qualifies(row,config,now))return false;
    const old=state.entries?.[identity(row)];
    return !old?.sentAt || (!old.eligible && now-old.sentAt>=3600000);
  });
}
export function record(rows,config,state,sent=[],now=Date.now()) {
  state.entries??={};
  const sentIds=new Set(sent.map(identity));
  for(const row of rows) {
    if(!core.norm(row.title).includes(core.norm(config.keyword)))continue;
    const id=identity(row), old=state.entries[id]||{};
    const eligible=core.qualifies(row,config,now);
    // Keep an unsent re-opening pending until its cooldown passes or delivery succeeds.
    state.entries[id]={date:row.date,eligible:sentIds.has(id)?true:(old.eligible===false?false:eligible),sentAt:sentIds.has(id)?now:old.sentAt||0};
    if(!eligible)state.entries[id].eligible=false;
  }
  for(const [id,e] of Object.entries(state.entries)) if(e.date<core.addDays(core.today(),-2))delete state.entries[id];
}
export function messages(rows) {
  const chunks=[];
  for(let i=0;i<rows.length;i+=12) {
    const group=rows.slice(i,i+12);
    chunks.push({rows:group,text:'🎬 CGV 용산아이파크몰 · 좌석 발견!\n\n'+group.map(r=>`${r.date} ${r.start}–${r.end}\n${r.title}\n${r.format} · ${r.room}\n잔여 ${r.remaining}/${r.total??'?'}석`).join('\n\n')+'\n\n'+THEATRE_URL+'\n좌석은 변동될 수 있습니다. 직접 예매해 주세요.'});
  }
  return chunks;
}
export async function telegram(text,env=process.env,fetcher=fetch) {
  const token=env.TELEGRAM_BOT_TOKEN||'',id=env.TELEGRAM_CHAT_ID||'';
  if(!/^\d+:[A-Za-z0-9_-]+$/.test(token)||!/^\d+$/.test(id))throw Error('개인 텔레그램 토큰 또는 채팅 ID가 설정되지 않았습니다.');
  let response;
  try {response=await fetcher(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:id,text,link_preview_options:{is_disabled:true}}),signal:AbortSignal.timeout(15000)});}
  catch {throw Error('텔레그램 연결 실패. 다음 실행에서 다시 시도합니다.');}
  let data;try{data=await response.json();}catch{throw Error('텔레그램 응답을 읽지 못했습니다.');}
  if(!response.ok||!data.ok)throw Error(`텔레그램 전송 실패 (상태 ${response.status}). 봇 시작 여부와 Secrets를 확인해 주세요.`);
}
