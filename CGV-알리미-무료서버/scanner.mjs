import {core,THEATRE_URL} from './logic.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export class AccessBlocked extends Error {}
// Reads only rendered schedule elements. No private API, login, seat selection or booking.
export function snapshotDOM() {
  const txt=e=>(e?.textContent||'').trim();
  const blocks=[...document.querySelectorAll('[class*="accordion_container"]')].filter(e=>e.querySelector('[class*="screenInfo_cinemaMovieWrap"]'));
  return {
    body:document.body.innerText,
    theatres:[...document.querySelectorAll('button[class*="roundtab_tabTitle"]')].filter(e=>e.title==='선택됨').map(txt),
    dates:[...document.querySelectorAll('button[class*="dayScroll_scrollItem"]')].map(e=>({label:txt(e),number:txt(e.querySelector('[class*="dayScroll_number"]')),selected:e.title==='선택됨',disabled:e.disabled||e.getAttribute('aria-disabled')==='true'})),
    movies:blocks.map(block=>({title:txt(block.querySelector('[class*="screenInfo_title"] .title2')),groups:[...block.querySelectorAll('[class*="screenInfo_contentWrap"]')].map(group=>({format:txt(group.querySelector('h3')),slots:[...group.querySelectorAll('button[class*="screenInfo_timeLink"]')].map(b=>({time:txt(b.querySelector('[class*="screenInfo_start"]'))+' '+txt(b.querySelector('[class*="screenInfo_end"]')),status:txt(b.querySelector('[class*="screenInfo_status"]')),room:txt(b.querySelector('[class*="screenInfo_theater"]')),disabled:b.disabled||b.getAttribute('aria-disabled')==='true'}))}))}))
  };
}
export function ensureAccess(s) {
  if(/비정상적으로 CGV|이용이 제한되었|접근이 차단|Just a moment|Verify you are human|보안 확인|captcha/i.test(s.body))throw new AccessBlocked('CGV에서 접근 제한 또는 보안 확인 화면을 반환했습니다. 자동 조회를 중지합니다.');
}
export function mappedDates(s,today=core.today()) {
  if(!s.dates.length||!s.dates[0].label.includes('오늘'))throw Error('CGV 날짜 목록 형식이 달라졌습니다.');
  return s.dates.map((d,i)=>{
    const date=core.addDays(today,i);
    const actual=d.number||d.label.replace(/^[가-힣]+\s*/,'');
    const expected=actual.includes('.')?`${Number(date.slice(5,7))}.${Number(date.slice(8))}`:String(Number(date.slice(8)));
    if((actual.includes('.')?actual:String(Number(actual)))!==expected)throw Error('CGV 날짜 목록이 예상과 다릅니다.');
    return {...d,date,index:i};
  });
}
export function parseSnapshot(s,date) {
  ensureAccess(s);
  if(s.theatres.length!==1||s.theatres[0]!=='용산아이파크몰')throw Error('선택된 극장이 용산아이파크몰이 아닙니다.');
  if(!mappedDates(s).find(d=>d.date===date)?.selected)throw Error('선택된 날짜가 조회 날짜와 다릅니다.');
  const rows=[];
  for(const movie of s.movies) {
    if(!movie.title)throw Error('영화 제목을 읽지 못했습니다.');
    for(const group of movie.groups) for(const raw of group.slots) rows.push(core.parseSlot({...raw,title:movie.title,format:group.format,room:raw.room||group.format,date}));
  }
  if(!rows.length&&!/상영시간표가 없습니다|상영 일정이 없습니다|상영일정이 없습니다/.test(s.body))throw Error('CGV 시간표를 읽지 못했습니다. 빈 결과로 처리하지 않습니다.');
  return rows;
}
export async function scan(days,onDate) {
  const {chromium}=await import('playwright');
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({locale:'ko-KR',timezoneId:'Asia/Seoul'});
  page.setDefaultTimeout(25000);
  const snap=async()=>{const s=await page.evaluate(snapshotDOM);ensureAccess(s);return s;};
  async function wait(predicate,timeout=30000) {
    const until=Date.now()+timeout;
    while(Date.now()<until){const s=await snap();if(predicate(s))return s;await sleep(500);}
    throw Error('CGV 시간표 로딩 시간이 초과되었습니다.');
  }
  const signature=s=>JSON.stringify(s.movies);
  try {
    const response=await page.goto(THEATRE_URL,{waitUntil:'domcontentloaded'});
    if([401,403,429].includes(response?.status()))throw new AccessBlocked(`CGV 접속 제한 (${response.status()}). 자동 조회를 중지합니다.`);
    await snap();
    await page.getByRole('button',{name:'상영시간표 상영시간표',exact:true}).click();
    let current=await wait(s=>s.theatres.includes('용산아이파크몰')&&s.dates.length>0&&(s.movies.length>0||/상영시간표가 없습니다|상영 일정이 없습니다|상영일정이 없습니다/.test(s.body)));
    for(const date of days) {
      const target=mappedDates(current).find(d=>d.date===date);
      if(!target||target.disabled){console.log(`${date}: 아직 선택할 수 없는 날짜`);continue;}
      if(!target.selected) {
        const before=signature(current);
        await page.locator('button[class*="dayScroll_scrollItem"]').nth(target.index).click();
        current=await wait(s=>mappedDates(s).find(d=>d.date===date)?.selected&&signature(s)!==before);
      }
      let last=signature(current),stable=Date.now();
      current=await wait(s=>{const value=signature(s);if(value!==last){last=value;stable=Date.now();}return Date.now()-stable>=2000;});
      await onDate(date,parseSnapshot(current,date));
      await sleep(2000);
    }
  } finally {await browser.close();}
}
