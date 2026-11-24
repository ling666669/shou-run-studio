// Client-side synthetic activity engine. Positions are WGS84, times UTC.
import {Encoder,Decoder,Stream,Profile,Utils,CrcCalculator} from './vendor/fitsdk/src/index.js';
export const CENTER=[30.884052,121.896904];
export const BOUNDS=[[30.879,121.889],[30.892,121.907]];
const R=6371008.8, RAD=Math.PI/180, SCALE=R*RAD;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const ensure=(ok,message)=>{if(!ok)throw Error(message);};
export function distance(a,b){const h=Math.sin((b[0]-a[0])*RAD/2)**2+Math.cos(a[0]*RAD)*Math.cos(b[0]*RAD)*Math.sin((b[1]-a[1])*RAD/2)**2;return 2*R*Math.asin(Math.sqrt(clamp(h,0,1)));}
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const roundPosition=p=>p.map(v=>Math.round(v/180*2**31)/2**31*180);
export function inCampus(p){return Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=BOUNDS[0][0]&&p[0]<=BOUNDS[1][0]&&p[1]>=BOUNDS[0][1]&&p[1]<=BOUNDS[1][1];}
export function stadium(s){const radius=36.5,straight=84.39,arc=Math.PI*radius,lap=2*straight+2*arc;let q=((s%lap)+lap)%lap,x,y;
  if(q<straight){x=-radius;y=-straight/2+q;}
  else if(q<straight+arc){const a=Math.PI-(q-straight)/radius;x=radius*Math.cos(a);y=straight/2+radius*Math.sin(a);}
  else if(q<2*straight+arc){x=radius;y=straight/2-(q-straight-arc);}
  else{const a=-(q-2*straight-arc)/radius;x=radius*Math.cos(a);y=-straight/2+radius*Math.sin(a);}
  return [CENTER[0]+y/SCALE,CENTER[1]+x/(SCALE*Math.cos(CENTER[0]*RAD))];
}
export function defaultRoute(){return Array.from({length:20},(_,i)=>stadium(i*(2*84.39+2*Math.PI*36.5)/20));}
export function makePath(config){
  let points;
  if(config.routeMode!=='custom')points=Array.from({length:401},(_,i)=>stadium(i*(2*84.39+2*Math.PI*36.5)/400));
  else{
    ensure(Array.isArray(config.route)&&config.route.length>=4&&config.route.length<=100,'自定义路线需要 4–100 个点。');
    ensure(config.route.every(inCampus),'路线点须位于上海海洋大学地图范围内。');
    const ps=config.route;points=[];
    // Closed Catmull-Rom spline, with bounded overshoot checked below.
    for(let i=0;i<ps.length;i++){
      const a=ps[(i-1+ps.length)%ps.length],b=ps[i],c=ps[(i+1)%ps.length],d=ps[(i+2)%ps.length];
      ensure(distance(b,c)>1,'相邻控制点至少相隔 1 米。');
      const count=Math.max(8,Math.ceil(distance(b,c)/2));
      for(let j=0;j<count;j++){
        const t=j/count;
        const p=b.map((v,k)=>.5*((2*v)+(-a[k]+c[k])*t+(2*a[k]-5*v+4*c[k]-d[k])*t*t+(-a[k]+3*v-3*c[k]+d[k])*t*t*t));
        ensure(inCampus(p),'曲线超出校园地图范围，请把控制点向内移动。');points.push(p);
      }
    }
    points.push(points[0]);
  }
  const cumulative=[0];for(let i=1;i<points.length;i++)cumulative.push(cumulative[i-1]+distance(points[i-1],points[i]));
  const length=cumulative.at(-1);ensure(length>50,'路线至少需要 50 米，请扩大路线。');
  function at(s){const target=((s%length)+length)%length;let lo=0,hi=cumulative.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(cumulative[mid]<=target)lo=mid;else hi=mid;}return mix(points[lo],points[hi],(target-cumulative[lo])/(cumulative[hi]-cumulative[lo]));}
  return {points,cumulative,length,at};
}
export function parsePace(text){const m=/^(\d{1,2}):([0-5]\d)$/.exec(String(text));ensure(m,'配速请填写 分:秒，例如 5:23。');const p=+m[1]*60+ +m[2];ensure(p>=150&&p<=900,'配速范围为 2:30–15:00 /公里。');return p;}
export function formatPace(s){const v=Math.round(s);return `${Math.floor(v/60)}:${String(v%60).padStart(2,'0')}`;}
export function formatDuration(s){const v=Math.round(s);return `${String(Math.floor(v/3600)).padStart(2,'0')}:${String(Math.floor(v/60)%60).padStart(2,'0')}:${String(v%60).padStart(2,'0')}`;}
export function beijing(t){return new Date(t+8*3600000).toISOString().slice(0,19).replace('T',' ');}
export function defaults(){return {name:'海大夜跑',date:beijing(Date.now()).slice(0,10),time:'20:08',mode:'duration',duration:1517,km:4.7,pace:'5:23',variation:5,bend:1.3,cadence:157,heartRate:169,power:192,weight:57,seed:1427,profile:'balanced',sport:'generic',routeMode:'stadium',route:defaultRoute()};}
export function normalize(input){const c={...defaults(),...input};
  ensure(typeof c.name==='string'&&c.name.trim().length>0&&c.name.length<=40,'活动名称需为 1–40 个字符。');c.name=c.name.trim();
  ensure(/^\d{4}-\d{2}-\d{2}$/.test(c.date)&&/^\d{2}:\d{2}$/.test(c.time),'请选择有效的日期和时间。');
  c.start=Date.parse(c.date+'T'+c.time+':00+08:00');ensure(Number.isFinite(c.start)&&beijing(c.start).slice(0,16)===c.date+' '+c.time,'日期或时间无效。');
  ensure(c.start>=Date.parse('2000-01-01'),'请选择 2000 年以后的日期。');
  ensure(['duration','distance'].includes(c.mode),'无效的生成模式。');
  c.paceSeconds=parsePace(c.pace);
  for(const [key,min,max] of [['variation',0,15],['bend',0,2],['cadence',100,210],['heartRate',90,195],['power',50,450],['weight',30,180],['seed',0,2147483647]]){
    c[key]=Number(c[key]);ensure(Number.isFinite(c[key])&&c[key]>=min&&c[key]<=max,`${key} 参数超出支持范围。`);
  }
  ensure(Number.isInteger(c.seed),'变化编号必须是整数。');
  ensure(['balanced','progressive','interval'].includes(c.profile),'无效的配速策略。');
  ensure(['generic','track'].includes(c.sport),'无效的运动类型。');
  ensure(['stadium','custom'].includes(c.routeMode),'无效的路线类型。');
  ensure(Array.isArray(c.route)&&c.route.length>=4&&c.route.length<=100&&c.route.every(inCampus),'路线配置无效或超出校园地图范围。');
  if(c.mode==='distance'){c.km=Number(c.km);ensure(Number.isFinite(c.km)&&c.km>=.2&&c.km<=30,'距离范围为 0.2–30 公里。');c.duration=Math.round(c.km*c.paceSeconds);c.target=c.km*1000;}
  else{c.duration=Number(c.duration);ensure(Number.isInteger(c.duration),'时长请精确到整秒。');c.target=c.duration/c.paceSeconds*1000;}
  ensure(c.duration>=60&&c.duration<=10800,'时长范围为 1 分钟至 3 小时。');ensure(c.target<=30000,'当前参数超过 30 公里，请缩短时长。');
  return c;
}
export function generate(input){
  const c=normalize(input),path=makePath(c),N=c.duration,phase=(c.seed%10007)/10007*Math.PI*2,meanSpeed=c.target/N;
  const weights=[];
  for(let t=1;t<=N;t++){
    const u=t/N;
    let shape=.55*Math.sin(u*5*Math.PI+phase)+.27*Math.sin(u*13+phase*.7)-.45*Math.exp(-t/100);
    if(c.profile==='progressive')shape+=(u-.5)*1.5;
    if(c.profile==='interval')shape+=.7*Math.sin(t/70+phase);
    weights.push(1+shape*c.variation/100);
  }
  const weightSum=weights.reduce((a,b)=>a+b,0);
  function position(s){
    const p=path.at(s),a=path.at(s-.5),b=path.at(s+.5),east=(b[1]-a[1])*Math.cos(p[0]*RAD),north=b[0]-a[0],norm=Math.hypot(east,north);
    const offset=c.bend*(.65*Math.sin(s/97*2*Math.PI+phase)+.35*Math.sin(s/233*2*Math.PI+phase*.3));
    return [p[0]-east/norm*offset/SCALE,p[1]+north/norm*offset/(SCALE*Math.cos(p[0]*RAD))];
  }
  const records=[{time:c.start,position:roundPosition(position(0)),distance:0,speed:0,steps:0}],hrRaw=[],cadRaw=[];
  let progress=0,desiredDistance=0,hr=c.heartRate-25;
  for(let t=1;t<=N;t++){
    const prev=records.at(-1);desiredDistance+=weights[t-1]/weightSum*c.target;
    const desired=desiredDistance-prev.distance;
    let lo=0,hi=desired*1.8+1;
    for(let attempts=0;distance(prev.position,position(progress+hi))<desired&&attempts<5;attempts++)hi*=1.5;
    for(let k=0;k<23;k++){const mid=(lo+hi)/2;if(distance(prev.position,position(progress+mid))<desired)lo=mid;else hi=mid;}
    progress+=(lo+hi)/2;
    const pos=roundPosition(position(progress)),speed=distance(prev.position,pos);
    ensure(speed>.01&&speed<12,'路线有过紧的折返，请扩大弯道。');ensure(inCampus(pos),'轨迹超出校园地图范围。');
    const cadence=c.cadence+18*(speed/meanSpeed-1)+1.5*Math.sin(t/61+phase);
    const hrTarget=c.heartRate+3+16*(speed/meanSpeed-1)+1.6*Math.sin(t/85+phase);
    hr+=(hrTarget-hr)/110;
    records.push({time:c.start+t*1000,position:pos,distance:prev.distance+speed,speed});hrRaw.push(hr);cadRaw.push(cadence);
  }
  const average=a=>a.reduce((s,v)=>s+v,0)/a.length;
  const hrShift=c.heartRate-average(hrRaw),cadShift=c.cadence-average(cadRaw);
  const rawPower=records.slice(1).map(p=>Math.pow(p.speed/meanSpeed,1.15)),powerScale=c.power/average(rawPower);
  for(let i=1;i<records.length;i++){
    const p=records[i];p.hr=clamp(Math.round(hrRaw[i-1]+hrShift),60,220);
    p.cadence=Math.round(clamp(cadRaw[i-1]+cadShift,80,230)/2*128)/128;
    p.power=Math.round(rawPower[i-1]*powerScale);p.steps=records[i-1].steps+p.cadence*2/60;
  }
  Object.assign(records[0],{hr:records[1].hr,cadence:records[1].cadence,power:records[1].power,speed:records[1].speed});
  const metres=records.at(-1).distance,totalSteps=Math.round(records.at(-1).steps),calories=Math.round(c.weight*metres/1000);
  function summary(first,last){const a=records[first],b=records[last],values=records.slice(first+1,last+1),seconds=last-first;
    const mean=key=>values.reduce((s,p)=>s+p[key],0)/seconds,max=key=>values.reduce((s,p)=>Math.max(s,p[key]),-Infinity);
    const steps=Math.round(b.steps)-Math.round(a.steps),metres=b.distance-a.distance;
    return {first,last,seconds,metres,steps,pace:seconds/metres*1000,avgCadence:mean('cadence')*2,maxCadence:max('cadence')*2,avgHr:Math.round(mean('hr')),maxHr:max('hr'),minHr:Math.min(...values.map(p=>p.hr)),avgPower:Math.round(mean('power')),maxPower:max('power'),maxSpeed:max('speed'),avgSpeed:metres/seconds,stepLength:metres/steps,calories:Math.round(b.distance/records.at(-1).distance*calories)-Math.round(a.distance/records.at(-1).distance*calories)};
  }
  const laps=[];let first=0,boundary=1000;
  for(let i=1;i<records.length;i++){
    if(records[i].distance>=boundary||i===N){laps.push(summary(first,i));first=i;boundary+=1000;}
  }
  // Exact km split times are interpolated for the display; FIT laps stay on
  // the one-second record timeline and retain their actual measured lengths.
  const splits=[];let prevTime=0,prevDistance=0,index=1;
  for(let d=1000;prevDistance<metres-.001;d+=1000){
    // Coordinate quantization can finish a few millimetres beyond an exact km.
    // Include that residual in the final split instead of a visible 0.00 km row.
    const end=metres-d<.03?metres:Math.min(d,metres);while(index<records.length-1&&records[index].distance<end)index++;
    const a=records[index-1],b=records[index],t=index-1+(end-a.distance)/(b.distance-a.distance);
    splits.push({metres:end-prevDistance,seconds:t-prevTime,pace:(t-prevTime)/(end-prevDistance)*1000});prevTime=t;prevDistance=end;
  }
  const total=summary(0,N),audit={passed:true,geometryMetres:metres,targetErrorMetres:Math.abs(metres-c.target),timeSeconds:N,steps:totalSteps,sampleCount:records.length};
  ensure(audit.targetErrorMetres<.03,'轨迹与目标距离误差过大，生成失败。');
  ensure(Math.abs(laps.reduce((s,l)=>s+l.metres,0)-metres)<1e-6,'分段距离校验失败。');
  ensure(laps.reduce((s,l)=>s+l.steps,0)===totalSteps,'分段步数校验失败。');
  return {config:c,records,laps,splits,total,pathLength:path.length,audit};
}
const semicircles=x=>Math.round(x/180*2**31);
export function exportFIT(activity){
  const {config:c,records:r,laps,total}=activity,encoder=new Encoder();
  const write=(type,data)=>{const fields=new Set(Object.values(Profile.messages[type].fields).map(f=>f.name));for(const k of Object.keys(data))ensure(fields.has(k),`FIT 字段不支持：${k}`);encoder.onMesg(type,data);};
  write(Profile.MesgNum.FILE_ID,{type:'activity',manufacturer:'development',product:1,productName:'SIMULATED DATA - SHOU',timeCreated:new Date(c.start)});
  write(Profile.MesgNum.DEVICE_INFO,{timestamp:new Date(c.start),deviceIndex:0,manufacturer:'development',product:1,productName:'SIMULATED HR CADENCE POWER',softwareVersion:3,sourceType:'local'});
  write(Profile.MesgNum.EVENT,{timestamp:new Date(c.start),event:'timer',eventType:'start',eventGroup:0});
  function fields(s){const a=r[s.first],b=r[s.last],strides=s.steps/2,cad=s.avgCadence/2,maxCad=s.maxCadence/2;
    return {timestamp:new Date(b.time),startTime:new Date(a.time),sport:'running',subSport:c.sport,startPositionLat:semicircles(a.position[0]),startPositionLong:semicircles(a.position[1]),endPositionLat:semicircles(b.position[0]),endPositionLong:semicircles(b.position[1]),totalElapsedTime:s.seconds,totalTimerTime:s.seconds,totalDistance:s.metres,totalCycles:Math.floor(strides),totalFractionalCycles:strides%1,avgCadence:Math.floor(cad),avgFractionalCadence:cad%1,maxCadence:Math.floor(maxCad),maxFractionalCadence:maxCad%1,avgHeartRate:s.avgHr,maxHeartRate:s.maxHr,minHeartRate:s.minHr,avgPower:s.avgPower,maxPower:s.maxPower,avgSpeed:s.avgSpeed,maxSpeed:s.maxSpeed,totalCalories:s.calories,avgStepLength:s.stepLength*1000};
  }
  let lap=0;
  r.forEach((p,i)=>{
    write(Profile.MesgNum.RECORD,{timestamp:new Date(p.time),positionLat:semicircles(p.position[0]),positionLong:semicircles(p.position[1]),distance:p.distance,speed:p.speed,heartRate:p.hr,cadence:Math.floor(p.cadence),fractionalCadence:p.cadence%1,power:p.power,totalCycles:Math.floor(p.steps/2),stepLength:p.speed/(p.cadence*2/60)*1000,activityType:'running'});
    if(i===r.length-1)write(Profile.MesgNum.EVENT,{timestamp:new Date(p.time),event:'timer',eventType:'stopAll',eventGroup:0});
    if(laps[lap]?.last===i){write(Profile.MesgNum.LAP,{...fields(laps[lap]),messageIndex:lap,event:'lap',eventType:'stop',lapTrigger:i===r.length-1?'sessionEnd':'distance'});lap++;}
  });
  write(Profile.MesgNum.SESSION,{...fields(total),messageIndex:0,event:'session',eventType:'stop',firstLapIndex:0,numLaps:laps.length,trigger:'activityEnd',sportProfileName:c.name});
  write(Profile.MesgNum.ACTIVITY,{timestamp:new Date(r.at(-1).time),totalTimerTime:c.duration,numSessions:1,type:'manual',event:'activity',eventType:'stop',localTimestamp:Utils.convertDateToDateTime(new Date(r.at(-1).time))+8*3600});
  const bytes=encoder.close();if(bytes[1]===0x02){bytes[1]=0x20;const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);view.setUint16(12,CrcCalculator.calculateCRC(bytes,0,12),true);view.setUint16(bytes.length-2,CrcCalculator.calculateCRC(bytes,0,bytes.length-2),true);}
  const decoder=new Decoder(Stream.fromBuffer(bytes));ensure(decoder.checkIntegrity(),'FIT 完整性校验未通过。');const {messages,errors}=decoder.read();ensure(!errors.length,'FIT 解析校验未通过。');
  const session=messages.sessionMesgs[0],samples=messages.recordMesgs;
  ensure(samples.length===r.length&&session.totalTimerTime===c.duration,'FIT 时间校验未通过。');
  ensure(Math.abs(session.totalDistance-total.metres)<.02,'FIT 距离校验未通过。');
  ensure((session.totalStrides+session.totalFractionalCycles)*2===total.steps,'FIT 步数校验未通过。');
  ensure(session.sportProfileName===c.name,'FIT 名称校验未通过。');
  return bytes;
}
const xmlEscape=s=>String(s).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
export function exportTCX(activity){const {config:c,records:r,laps}=activity,iso=p=>new Date(p.time).toISOString();
  const point=p=>`<Trackpoint><Time>${iso(p)}</Time><Position><LatitudeDegrees>${p.position[0].toFixed(10)}</LatitudeDegrees><LongitudeDegrees>${p.position[1].toFixed(10)}</LongitudeDegrees></Position><DistanceMeters>${p.distance.toFixed(3)}</DistanceMeters><HeartRateBpm><Value>${p.hr}</Value></HeartRateBpm><Extensions><ns3:TPX><ns3:Speed>${p.speed.toFixed(6)}</ns3:Speed><ns3:RunCadence>${Math.round(p.cadence)}</ns3:RunCadence><ns3:Watts>${p.power}</ns3:Watts></ns3:TPX></Extensions></Trackpoint>`;
  const body=laps.map(l=>`<Lap StartTime="${iso(r[l.first])}"><TotalTimeSeconds>${l.seconds}</TotalTimeSeconds><DistanceMeters>${l.metres.toFixed(3)}</DistanceMeters><MaximumSpeed>${l.maxSpeed.toFixed(6)}</MaximumSpeed><Calories>${l.calories}</Calories><AverageHeartRateBpm><Value>${l.avgHr}</Value></AverageHeartRateBpm><MaximumHeartRateBpm><Value>${l.maxHr}</Value></MaximumHeartRateBpm><Intensity>Active</Intensity><TriggerMethod>${l.last===r.length-1?'Time':'Distance'}</TriggerMethod><Track>${r.slice(l.first,l.last+1).map(point).join('\n')}</Track><Extensions><ns3:LX><ns3:AvgSpeed>${l.avgSpeed.toFixed(6)}</ns3:AvgSpeed><ns3:AvgRunCadence>${Math.round(l.avgCadence/2)}</ns3:AvgRunCadence><ns3:MaxRunCadence>${Math.round(l.maxCadence/2)}</ns3:MaxRunCadence><ns3:Steps>${l.steps}</ns3:Steps><ns3:AvgWatts>${l.avgPower}</ns3:AvgWatts><ns3:MaxWatts>${l.maxPower}</ns3:MaxWatts></ns3:LX></Extensions></Lap>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2"><Activities><Activity Sport="Running"><Id>${iso(r[0])}</Id>${body}<Notes>${xmlEscape(c.name)} | SIMULATED DATA / 模拟数据。轨迹、时间、步数、心率、功率和热量均为合成测试数据，非传感器测量。TCX 步频按整数单侧步周期编码，存在舍入；精确步数请使用分段 Steps 或 FIT。</Notes><Creator xsi:type="Device_t"><Name>SHOU Run Studio SIMULATED</Name><UnitId>0</UnitId><ProductID>0</ProductID><Version><VersionMajor>3</VersionMajor><VersionMinor>0</VersionMinor></Version></Creator></Activity></Activities></TrainingCenterDatabase>`;
}
export function exportReport(a){return JSON.stringify({classification:'SIMULATED / 模拟数据',name:a.config.name,start:beijing(a.config.start),end:beijing(a.records.at(-1).time),timezone:'Asia/Shanghai',total:a.total,splits:a.splits,audit:a.audit,keepDisplayVerified:false},null,2);}
