import {normalize,makePath,parsePace,formatPace,generate,exportFIT,beijing} from './engine.js';

const check=(condition,message)=>{if(!condition)throw Error(message);};
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export const MAX_BATCH_DAYS=31;
function dateStamp(text){
  check(/^\d{4}-\d{2}-\d{2}$/.test(text),'日期格式应为 YYYY-MM-DD。');
  const stamp=Date.parse(text+'T00:00:00Z');
  check(Number.isFinite(stamp)&&new Date(stamp).toISOString().slice(0,10)===text&&text>='2000-01-01'&&text<='2099-12-31',`日期无效：${text}`);
  return stamp;
}
export function expandDates(text){
  check(typeof text==='string'&&text.length<=4096,'日期内容过长。');
  const tokens=text.trim().split(/[,，;；\s]+/).filter(Boolean),dates=new Set();
  check(tokens.length,'请先选择或填写需要生成的日期。');
  for(const token of tokens){
    const range=token.split('..');check(range.length<=2,'日期范围请用两个英文点连接。');
    const start=dateStamp(range[0]),end=range.length===2?dateStamp(range[1]):start;
    check(end>=start,'日期范围的结束日期不能早于开始日期。');
    check((end-start)/86400000<MAX_BATCH_DAYS,`单个日期范围不能超过 ${MAX_BATCH_DAYS} 天。`);
    for(let t=start;t<=end;t+=86400000)dates.add(new Date(t).toISOString().slice(0,10));
    check(dates.size<=MAX_BATCH_DAYS,`一次最多生成 ${MAX_BATCH_DAYS} 天，请分批生成。`);
  }
  return [...dates].sort();
}
function minute(text){check(/^([01]\d|2[0-3]):[0-5]\d$/.test(text),'起跑时间请填写有效的 时:分。');return +text.slice(0,2)*60+ +text.slice(3);}
function random(seed){let state=(seed>>>0)||0x6d2b79f5;return ()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};}
function shuffled(values,rng){const a=values.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function spread(min,max,count,rng,label){check(max-min+1>=count,`${label}的可选值不足以保证每天不同，请扩大范围或减少日期。`);const n=max-min+1;return shuffled(Array.from({length:count},(_,i)=>min+Math.floor(i*n/count)+Math.floor(rng()*(Math.floor((i+1)*n/count)-Math.floor(i*n/count)))),rng);}

export function planBatch(base,input){
  const dates=expandDates(input.dates),kmMin=Number(input.kmMin),kmMax=Number(input.kmMax),fast=parsePace(input.paceMin),slow=parsePace(input.paceMax);
  check(Number.isFinite(kmMin)&&Number.isFinite(kmMax)&&kmMin>=.2&&kmMax<=30&&kmMax>kmMin,'距离范围应为 0.2–30 km，最大值需大于最小值。');
  check(slow-fast>=6,'配速范围至少相差 6 秒，为分公里变化保留空间。');
  const start=minute(input.timeFrom),end=minute(input.timeTo);
  check(end>=start,'起跑时间范围请设在同一天，结束时间不能早于开始时间。');
  const seed=Number(input.seed);check(Number.isInteger(seed)&&seed>=0&&seed<=2147483647,'批次编号应为 0–2147483647 的整数。');
  const weight=Number(input.weight);check(Number.isFinite(weight)&&weight>=30&&weight<=180,'体重参考范围为 30–180 kg。');
  const rng=random(seed),count=dates.length;
  // Leave 2 s/km of headroom for variable splits, including partial final km.
  const paces=spread(fast+2,slow-2,count,rng,'配速范围'),kms=spread(Math.ceil(kmMin*100),Math.floor(kmMax*100),count,rng,'距离范围'),times=spread(start,end,count,rng,'起跑时间范围');
  const configs=dates.map((date,i)=>{
    // Align distance to whole-second duration so rounding does not make two
    // short activities display the same mean pace. The adjustment stays within
    // half one second of travel and inside the selected distance bounds.
    const seconds=clamp(Math.round(kms[i]/100*paces[i]),Math.ceil(kmMin*paces[i]),Math.floor(kmMax*paces[i]));
    const target=seconds/paces[i];
    const config=normalize({...base,name:String(base.name||'海大跑步').trim().slice(0,28)+' '+date.slice(5),date,time:`${String(Math.floor(times[i]/60)).padStart(2,'0')}:${String(times[i]%60).padStart(2,'0')}`,mode:'distance',km:target,pace:formatPace(paces[i]),weight,seed:Math.floor(rng()*2147483647),
      heartRate:clamp(Math.round(Number(base.heartRate)+(rng()-.5)*8),90,195),cadence:clamp(Math.round(Number(base.cadence)+(rng()-.5)*6),100,210),power:clamp(Math.round(Number(base.power)+(rng()-.5)*16),50,450)});
    return {config,bounds:{kmMin,kmMax,fast,slow},batchSeed:seed};
  });
  makePath(configs[0].config);
  return {dates,items:configs,seed};
}

export function generateBatchItem(item){
  const {config,bounds}=item;
  const padding=Math.min(config.paceSeconds-bounds.fast,bounds.slow-config.paceSeconds);
  // Scale the user's variation down only when needed to respect split bounds.
  const variation=Math.min(Math.max(config.variation,1.5),padding/config.paceSeconds*100*1.7);
  let chosen=null;
  for(let attempt=0;attempt<36;attempt++){
    const candidate=generate({...config,seed:(config.seed+attempt*9973)%2147483647,profile:['progressive','interval','balanced'][attempt%3],variation:variation*(attempt>=24?.55:1)});
    const values=candidate.splits.map(p=>p.pace),rounded=values.map(Math.round);
    const allWithin=values.every(p=>p>=bounds.fast&&p<=bounds.slow)&&candidate.laps.every(p=>p.pace>=bounds.fast&&p.pace<=bounds.slow);
    const varied=values.length<2||new Set(rounded).size>1;
    const d=candidate.total.metres;
    if(allWithin&&varied&&d>=bounds.kmMin*1000-.03&&d<=bounds.kmMax*1000+.03){chosen=candidate;break;}
  }
  check(chosen,`${config.date} 未找到满足每公里配速范围的方案，请扩大范围或调整路线。`);
  const bytes=exportFIT(chosen),c=chosen.config;
  const safeName=c.name.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_');
  return {file:`SIMULATED_${safeName}_${c.date.replaceAll('-','')}_${c.time.replace(':','')}.fit`,bytes,config:c,total:chosen.total,splits:chosen.splits,audit:chosen.audit,start:beijing(c.start),end:beijing(chosen.records.at(-1).time)};
}

export function batchReport(results,failed=[]){return JSON.stringify({classification:'SIMULATED / 模拟数据',timezone:'Asia/Shanghai',count:results.length,failed,keepDisplayVerified:false,activities:results.map(({bytes,...data})=>data)},null,2);}
