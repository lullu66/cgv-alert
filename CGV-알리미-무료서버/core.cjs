/* Shared pure functions; no credentials or network access. */
(function (root) {
  const today = () => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const addDays = (iso, n) => new Date(Date.parse(iso+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
  const norm = s => String(s || '').replace(/\s+/g,'').toLowerCase();
  function dates(start,end) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) throw Error('날짜를 입력해 주세요.');
    const count = (Date.parse(end)-Date.parse(start))/86400000+1;
    if (!Number.isInteger(count) || count<1 || count>14) throw Error('확인 기간은 1~14일로 선택해 주세요.');
    return Array.from({length:count},(_,i)=>addDays(start,i));
  }
  function validate(c) {
    dates(c.start,c.end);
    if (c.end<today()) throw Error('종료일이 이미 지났습니다.');
    if (!c.keyword?.trim()) throw Error('영화 이름을 입력해 주세요.');
    if (!Number.isInteger(c.minSeats)||c.minSeats<1||c.minSeats>1000) throw Error('최소 좌석은 1~1000석입니다.');
    if (!Number.isInteger(c.interval)||c.interval<1||c.interval>30) throw Error('확인 간격은 1~30분입니다.');
    if (c.telegram && (!/^\d+:[A-Za-z0-9_-]+$/.test(c.token)||!/^\d+$/.test(c.chatId))) throw Error('텔레그램 토큰과 개인 채팅 ID를 확인해 주세요.');
    if (!c.desktop&&!c.telegram) throw Error('알림 방법을 하나 이상 선택해 주세요.');
    return c;
  }
  function parseSlot(raw) {
    const times=raw.time.match(/(\d{1,2}:\d{2})/g);
    const seats=raw.status.replace(/,/g,'').match(/(\d+)\s*\/\s*(\d+)\s*석/);
    if (!times || times.length!==2) throw Error('시간표 형식이 변경되었습니다.');
    let remaining=null,total=null;
    if (seats) {remaining=Number(seats[1]);total=Number(seats[2]);}
    else if (/매진|예매종료|예매마감|준비/.test(raw.status)) remaining=0;
    else throw Error('잔여 좌석을 읽지 못했습니다.');
    if (total!==null && remaining>total) throw Error('좌석 데이터가 올바르지 않습니다.');
    return {...raw,start:times[0],end:times[1],remaining:raw.disabled?0:remaining,total};
  }
  function qualifies(s,c,now=Date.now()) {
    const [h,m]=s.start.split(':').map(Number);
    const instant=Date.parse(s.date+'T00:00:00+09:00')+(h*60+m)*60000;
    return norm(s.title).includes(norm(c.keyword)) && s.remaining>=c.minSeats && instant>now;
  }
  const key=s=>[s.date,s.title,s.format,s.room,s.start].join('|');
  root.CgvCore={today,addDays,norm,dates,validate,parseSlot,qualifies,key};
  if (typeof module!=='undefined') module.exports=root.CgvCore;
})(globalThis);
