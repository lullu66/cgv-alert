import test from 'node:test';
import assert from 'node:assert/strict';
import {core,candidates,record,messages,telegram} from '../logic.mjs';
import {mappedDates,parseSnapshot,ensureAccess,AccessBlocked} from '../scanner.mjs';
import {runBatch} from '../batch.mjs';
const date=core.addDays(core.today(),2),now=Date.now();
const row=core.parseSlot({date,title:'극장판 치이카와-인어 섬의 비밀',format:'2D 자막',room:'1관 (Laser)',time:'23:40 - 25:29',status:'202/204석',disabled:false});
const config={keyword:'치이카와',minSeats:2};
test('month/year rollover and bounded ranges',()=>{
  assert.deepEqual(core.dates('2026-12-31','2027-01-02'),['2026-12-31','2027-01-01','2027-01-02']);
  assert.throws(()=>core.dates('2026-10-04','2026-10-01'));
  assert.throws(()=>core.dates('2026-10-01','2026-11-01'));
});
test('live CGV format: morning suffix, sold out, malformed count',()=>{
  assert.equal(core.parseSlot({...row,time:'08:30 - 10:19',status:'124/204석조조'}).remaining,124);
  assert.equal(core.parseSlot({...row,time:'08:30 - 10:19',status:'매진'}).remaining,0);
  assert.throws(()=>core.parseSlot({...row,time:'08:30 - 10:19',status:'???'}));
  assert.throws(()=>core.parseSlot({...row,time:'08:30 - 10:19',status:'300/204석'}));
});
test('Korean midnight plus 24+ hour showtimes',()=>{
  const midnight=Date.parse(date+'T00:00:00+09:00');
  assert(core.qualifies({...row,start:'25:00'},config,midnight+24*3600000));
  assert(!core.qualifies({...row,start:'25:00'},config,midnight+26*3600000));
  assert(!core.qualifies({...row,remaining:1},config,now));
});
test('one notification per qualifying run; fluctuations do not spam',()=>{
  const state={entries:{}};
  assert.equal(candidates([row],config,state,now).length,1);
  record([row],config,state,[row],now);
  assert.equal(candidates([{...row,remaining:180}],config,state,now+10000).length,0);
});
test('sold out then reopened is eligible after 60 minute cooldown',()=>{
  const state={entries:{}};record([row],config,state,[row],now);
  record([{...row,remaining:0}],config,state,[],now+1000);
  assert.equal(candidates([row],config,state,now+2000).length,0);
  record([row],config,state,[],now+2000);
  assert.equal(candidates([row],config,state,now+3600001).length,1);
});
test('failed delivery remains pending',()=>{
  const state={entries:{}};record([row],config,state,[],now);
  assert.equal(candidates([row],config,state,now+1000).length,1);
});
test('selected dates map across month boundary and reject drift',()=>{
  const snap={dates:[{label:'오늘 30',number:'30'},{label:'목 10.1',number:'10.1'}]};
  assert.deepEqual(mappedDates(snap,'2026-09-30').map(x=>x.date),['2026-09-30','2026-10-01']);
  assert.throws(()=>mappedDates(snap,'2026-09-29'));
});
test('blocked pages fail closed',()=>{
  assert.throws(()=>ensureAccess({body:'비정상적으로 CGV에 접속한 것이 확인되어 이용이 제한되었어요.'}),AccessBlocked);
});
test('snapshot requires correct theatre/date and real seat schema',()=>{
  const today=core.today();
  const snap={body:'시간표',theatres:['용산아이파크몰'],dates:[{label:'오늘 '+today.slice(8),number:today.slice(8),selected:true}],movies:[{title:row.title,groups:[{format:row.format,slots:[{...row,time:'23:40 - 25:29',status:'202/204석'}]}]}]};
  assert.equal(parseSnapshot(snap,today)[0].remaining,202);
  assert.throws(()=>parseSnapshot({...snap,theatres:['강남']},today));
  assert.throws(()=>parseSnapshot({...snap,movies:[]},today));
});
test('telegram uses private recipient and never includes token in error',async()=>{
  const env={TELEGRAM_BOT_TOKEN:'123:abc_DEF',TELEGRAM_CHAT_ID:'12345'};
  let request;
  await telegram('테스트',env,async(url,options)=>{request={url,options};return {ok:true,json:async()=>({ok:true})};});
  assert.equal(JSON.parse(request.options.body).chat_id,'12345');
  await assert.rejects(telegram('test',env,async()=>{throw Error('123:abc_DEF');}),e=>!e.message.includes('abc_DEF'));
  await assert.rejects(telegram('test',env,async()=>({ok:false,status:401,json:async()=>({ok:false})})),/전송 실패/);
});
test('batching stays below Telegram message limit',()=>{
  assert.equal(messages(Array(25).fill(row)).length,3);
  assert(messages(Array(25).fill(row)).every(m=>m.text.length<4096));
});
test('five checks begin one minute apart, including scan time',async()=>{
  let time=0;const starts=[];
  await runBatch(async()=>{starts.push(time);time+=17000;},{clock:()=>time,sleep:async ms=>{time+=ms;}});
  assert.deepEqual(starts,[0,60000,120000,180000,240000]);
});
test('slow checks do not overlap; halt stops the batch',async()=>{
  let time=0;const starts=[];
  await runBatch(async i=>{starts.push(time);time+=80000;if(i===1)return false;},{clock:()=>time,sleep:async ms=>{assert(ms>=0);time+=ms;}});
  assert.deepEqual(starts,[0,80000]);
});
