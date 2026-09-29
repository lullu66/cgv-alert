// One GitHub run checks five times. Delay is measured from the previous start;
// a slow scan never triggers overlapping requests or a burst of catch-up work.
export async function runBatch(check,{count=5,interval=60000,clock=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}) {
  for(let i=0;i<count;i++) {
    const started=clock();
    if(await check(i)===false)break;
    if(i<count-1)await sleep(Math.max(0,interval-(clock()-started)));
  }
}
