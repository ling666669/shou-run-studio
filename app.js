import {defaults,normalize,generate,exportFIT,exportTCX,exportReport,defaultRoute,makePath,BOUNDS,CENTER,inCampus,beijing,formatDuration,formatPace} from './engine.js';
const $=id=>document.getElementById(id),STORE='shou-run-studio-plans-v1';
let mode='duration',routeMode='stadium',route=defaultRoute(),history=[],editing=false,activity=null,busy=false,toastTimer;
let controls=[],online=false,tiles=null;
function notify(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);$('status').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('status').hidden=true,error?9500:5000);}
function readPlans(){try{const data=JSON.parse(localStorage.getItem(STORE)||'[]');return Array.isArray(data)?data.slice(0,30):[];}catch{return [];}}
function savePlans(plans){localStorage.setItem(STORE,JSON.stringify(plans));renderSaved();}
function config(){return {name:$('name').value,date:$('date').value,time:$('time').value,mode,duration:Number($('minutes').value)*60+Number($('seconds').value),km:Number($('km').value),pace:$('pace').value.trim(),variation:Number($('variation').value),bend:Number($('bend').value),cadence:Number($('cadence').value),heartRate:Number($('heartRate').value),power:Number($('power').value),weight:Number($('weight').value),seed:Number($('seed').value),profile:$('profile').value,sport:$('sport').value,routeMode,route:route.map(p=>p.slice())};}
function setMode(next){mode=next;$('durationFields').hidden=mode!=='duration';$('distanceFields').hidden=mode!=='distance';for(const m of ['duration','distance']){$(m+'Mode').classList.toggle('selected',m===mode);$(m+'Mode').setAttribute('aria-pressed',String(m===mode));}}
function labels(){$('variationValue').value=$('variation').value+'%';$('bendValue').value=Number($('bend').value).toFixed(1)+' m';}
function markDirty(){activity=null;for(const id of ['fitExportBtn','tcxBtn','reportBtn'])$(id).disabled=true;$('auditBadge').textContent='参数已更改 · 请重新生成';$('auditBadge').classList.add('stale');$('exportTitle').textContent='更新预览后即可导出';labels();}
function applyConfig(data){const c=normalize(data);for(const id of ['name','date','time','km','pace','variation','bend','cadence','heartRate','power','weight','seed','profile','sport'])$(id).value=c[id];$('minutes').value=Math.floor(c.duration/60);$('seconds').value=c.duration%60;setMode(c.mode);routeMode=c.routeMode;route=c.route.map(p=>p.slice());editing=false;history=[];labels();renderRoute();markDirty();}
const map=L.map('map',{zoomControl:false,maxBounds:BOUNDS,maxBoundsViscosity:1,minZoom:15,maxZoom:19,zoomSnap:.5,doubleClickZoom:false}).setView(CENTER,18);
L.control.zoom({position:'bottomright'}).addTo(map);L.control.scale({imperial:false,position:'bottomleft'}).addTo(map);
L.imageOverlay('campus.svg',[[30.8823,121.8944],[30.8859,121.8994]],{interactive:false,attribution:'海大跑步工坊 · 校园示意'}).addTo(map);
const routeLine=L.polyline([],{color:'#558775',weight:3,opacity:.5,dashArray:'5 7'}).addTo(map);
const runLine=L.polyline([],{color:'#24846d',weight:3,opacity:.65}).addTo(map);
let endpoints=[];
function clearEndpoints(){endpoints.forEach(m=>m.remove());endpoints=[];}
function rememberRoute(){history.push({route:route.map(p=>p.slice()),routeMode});if(history.length>40)history.shift();}
function renderRoute(){
  controls.forEach(m=>m.remove());controls=[];clearEndpoints();runLine.setLatLngs([]);
  try{routeLine.setLatLngs(makePath({route,routeMode}).points);}catch{routeLine.setLatLngs([...route,route[0]]);}
  $('editBtn').classList.toggle('active',editing);$('editBtn').textContent=editing?'完成编辑':'编辑路线';$('stadiumBtn').classList.toggle('active',routeMode==='stadium');$('undoBtn').disabled=!history.length;
  $('mapLabel').textContent=routeMode==='stadium'?'东体育场闭合路线':'校园自定义路线';
  $('routeHint').textContent=editing?'拖动绿色点调整；蓝色加号插点；右键删除点。':'校园地图固定在上海海洋大学。路线不够长时自动循环。';
  if(!editing)return;
  route.forEach((p,i)=>{
    const marker=L.marker(p,{draggable:true,icon:L.divIcon({className:'control-point',html:String(i+1),iconSize:[22,22],iconAnchor:[11,11]}),title:`路线点 ${i+1}，拖动调整，右键删除`}).addTo(map);
    marker.on('dragstart',()=>rememberRoute());
    marker.on('drag',()=>{const ll=marker.getLatLng();if(inCampus([ll.lat,ll.lng])){route[i]=[ll.lat,ll.lng];routeMode='custom';routeLine.setLatLngs([...route,route[0]]);}});
    marker.on('dragend',()=>{routeMode='custom';renderRoute();markDirty();});
    marker.on('contextmenu',e=>{L.DomEvent.stopPropagation(e);if(route.length<=4)return notify('至少保留 4 个路线点。',true);rememberRoute();route.splice(i,1);routeMode='custom';renderRoute();markDirty();});controls.push(marker);
    const next=route[(i+1)%route.length],middle=[(p[0]+next[0])/2,(p[1]+next[1])/2];
    const mid=L.marker(middle,{icon:L.divIcon({className:'mid-point',html:'+',iconSize:[18,18],iconAnchor:[9,9]}),title:'点击添加一个路线点'}).addTo(map);
    mid.on('click',e=>{L.DomEvent.stopPropagation(e);if(route.length>=100)return notify('最多 100 个路线点。',true);rememberRoute();route.splice(i+1,0,middle);routeMode='custom';renderRoute();markDirty();});controls.push(mid);
  });
}
function fitRoute(){if(routeLine.getLatLngs().length)map.fitBounds(routeLine.getBounds(),{padding:[70,50],maxZoom:18.5});}
$('fitBtn').onclick=fitRoute;
$('stadiumBtn').onclick=()=>{rememberRoute();route=defaultRoute();routeMode='stadium';editing=false;renderRoute();fitRoute();markDirty();};
$('editBtn').onclick=()=>{editing=!editing;renderRoute();if(activity&&!editing)showTrack(activity);};
$('undoBtn').onclick=()=>{const p=history.pop();if(!p)return;route=p.route;routeMode=p.routeMode;renderRoute();markDirty();};
$('tilesBtn').onclick=()=>{
  if(online){map.removeLayer(tiles);online=false;$('tilesBtn').textContent='加载在线底图 ↗';$('tileStatus').textContent='校园示意底图 · 非测绘地图';return;}
  if(!tiles){tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,bounds:BOUNDS,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'});tiles.on('tileerror',()=>{$('tileStatus').textContent='在线底图加载失败，可切回校园示意图';});tiles.on('load',()=>{if(online)$('tileStatus').textContent='OpenStreetMap · 在线地图';});}
  online=true;tiles.addTo(map);$('tilesBtn').textContent='切回校园示意图';$('tileStatus').textContent='正在加载在线底图…';
};
function showTrack(a){clearEndpoints();runLine.setLatLngs(a.records.map(p=>p.position));endpoints=[L.marker(a.records[0].position,{icon:L.divIcon({className:'endpoint start',iconSize:[13,13],iconAnchor:[6,6]}),title:'起点'}).addTo(map),L.marker(a.records.at(-1).position,{icon:L.divIcon({className:'endpoint end',iconSize:[13,13],iconAnchor:[6,6]}),title:'终点'}).addTo(map)];}
function renderActivity(a){
  const t=a.total,metrics=[['距离',(t.metres/1000).toFixed(3),'km'],['训练时长',formatDuration(t.seconds).replace(/^00:/,''),''],['平均配速',formatPace(t.pace),'/km'],['平均心率',t.avgHr,'bpm'],['累计步数',t.steps.toLocaleString(),'步'],['平均步频',t.avgCadence.toFixed(0),'步/分'],['平均功率',t.avgPower,'W'],['估算热量',t.calories,'kcal']];
  $('metrics').replaceChildren();metrics.forEach(([label,value,unit],i)=>{const div=document.createElement('div');div.className='metric'+(i>3?' secondary':'');const labelEl=document.createElement('span'),strong=document.createElement('strong'),small=document.createElement('small');labelEl.textContent=label;strong.textContent=value;small.textContent=unit;div.append(labelEl,strong,small);$('metrics').append(div);});
  $('timeRange').textContent=`${beijing(a.config.start)} → ${beijing(a.records.at(-1).time).slice(11)}（北京时间）`;
  $('sampleCount').textContent=`${a.records.length.toLocaleString()} 个轨迹点 · 步幅 ${t.stepLength.toFixed(2)} m`;
  $('auditBadge').textContent='✓ 距离 · 时间 · 步数已校验';$('auditBadge').classList.remove('stale');
  $('splitRows').replaceChildren();const fastest=Math.min(...a.splits.map(s=>s.pace)),slowest=Math.max(...a.splits.map(s=>s.pace));
  a.splits.forEach((s,i)=>{const row=document.createElement('div');row.className='split-row'+(s.pace===fastest?' fastest':'');const label=document.createElement('span'),track=document.createElement('div'),bar=document.createElement('div'),pace=document.createElement('strong');label.textContent=s.metres>999?`${i+1} km`:`余 ${(s.metres/1000).toFixed(2)}`;track.className='bar-track';bar.className='bar';bar.style.width=`${50+(slowest-s.pace)/(slowest-fastest||1)*45}%`;pace.textContent=formatPace(s.pace);track.append(bar);row.append(label,track,pace);$('splitRows').append(row);});
  const samples=a.records.filter((_,i)=>i%Math.max(1,Math.floor(a.records.length/200))===0),hrMin=Math.min(...samples.map(p=>p.hr))-4,hrMax=Math.max(...samples.map(p=>p.hr))+4;
  const points=samples.map((p,i)=>`${(i/(samples.length-1)*400).toFixed(2)},${(110-(p.hr-hrMin)/(hrMax-hrMin)*90).toFixed(2)}`).join(' ');
  $('hrChart').innerHTML=`<defs><linearGradient id="hrFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d7b499" stop-opacity=".4"/><stop offset="1" stop-color="#d7b499" stop-opacity="0"/></linearGradient></defs><path d="M0 30H400M0 70H400M0 110H400" stroke="#eef0e8" stroke-width="1" fill="none"/><polygon points="0,120 ${points} 400,120" fill="url(#hrFill)"/><polyline points="${points}" fill="none" stroke="#b88865" stroke-width="2.3" stroke-linejoin="round"/>`;
  $('hrRange').textContent=`${t.minHr}–${t.maxHr} bpm`;$('exportTitle').textContent=a.config.name+' · 已就绪';for(const id of ['fitExportBtn','tcxBtn','reportBtn'])$(id).disabled=false;showTrack(a);
}
async function generateNow(silent=false){
  if(busy)return;busy=true;$('generateBtn').disabled=true;$('generateBtn').textContent='正在生成与校验…';
  try{if(mode==='duration'&&(!Number.isInteger(Number($('seconds').value))||Number($('seconds').value)<0||Number($('seconds').value)>59))throw Error('秒数请输入 0–59 的整数。');await new Promise(resolve=>setTimeout(resolve,25));activity=generate(config());renderActivity(activity);if(!silent)notify('方案已生成，距离、时长和步数校验通过。');}
  catch(e){markDirty();$('auditBadge').textContent='请检查参数';notify(e.message,true);}
  finally{busy=false;$('generateBtn').disabled=false;$('generateBtn').innerHTML='生成并预览 <span>↗</span>';}
}
$('settingsForm').onsubmit=e=>{e.preventDefault();generateNow();};
$('settingsForm').addEventListener('input',markDirty);$('settingsForm').addEventListener('change',markDirty);$('bend').oninput=markDirty;
$('durationMode').onclick=()=>{setMode('duration');markDirty();};$('distanceMode').onclick=()=>{setMode('distance');markDirty();};
$('randomBtn').onclick=()=>{$('seed').value=crypto.getRandomValues(new Uint32Array(1))[0]%2147483647;markDirty();generateNow();};
$('resetBtn').onclick=()=>{applyConfig(defaults());fitRoute();generateNow();};
function download(name,content,type){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),120000);}
function fileStem(){const c=activity.config;return `SIMULATED_${c.name.replace(/[\\/:*?"<>|\x00-\x1F]/g,'_')}_${c.date.replaceAll('-','')}_${c.time.replace(':','')}_${c.seed}`;}
$('fitExportBtn').onclick=()=>{if(!activity)return;try{download(fileStem()+'.fit',exportFIT(activity),'application/octet-stream');notify('FIT 已生成并通过完整性校验。请在下载或“文件”App 中查看。');}catch(e){notify('FIT 导出失败：'+e.message+'；可尝试 TCX 或更新浏览器。',true);}};
$('tcxBtn').onclick=()=>{if(!activity)return;try{download(fileStem()+'.tcx',exportTCX(activity),'application/vnd.garmin.tcx+xml');notify('TCX 文件已下载。');}catch(e){notify(e.message,true);}};
$('reportBtn').onclick=()=>{if(activity)download(fileStem()+'_report.json',exportReport(activity),'application/json');};
function bundle(){const c=normalize(config());makePath(c);return {version:1,type:'shou-run-studio-plan',config:c};}
$('backupBtn').onclick=()=>{try{download('SHOU_RUN_PLAN_'+Date.now()+'.json',JSON.stringify(bundle(),null,2),'application/json');notify('方案已备份，可在其他设备导入。');}catch(e){notify(e.message,true);}};
$('saveBtn').onclick=()=>{try{const item={...bundle(),id:crypto.randomUUID(),savedAt:new Date().toISOString()},plans=readPlans();if(plans.length>=30)throw Error('最多保存 30 个方案，请先删除不需要的方案或导出备份。');plans.unshift(item);savePlans(plans);notify('方案已保存在当前浏览器。');}catch(e){notify('保存失败：'+e.message,true);}};
function renderSaved(){const list=$('savedList');list.replaceChildren();const plans=readPlans();if(!plans.length){const p=document.createElement('p');p.className='hint';p.textContent='保存常用配置，下次直接载入。';list.append(p);return;}plans.forEach(item=>{const row=document.createElement('div');row.className='saved-item';const load=document.createElement('button'),remove=document.createElement('button'),name=document.createElement('span'),small=document.createElement('small');name.textContent=String(item.config?.name||'未命名方案');small.textContent=`${item.config?.time||''} · ${item.config?.pace||''} /km`;load.append(name,small);load.onclick=()=>{try{applyConfig(item.config);fitRoute();generateNow();}catch(e){notify('无法载入该方案：'+e.message,true);}};remove.textContent='×';remove.setAttribute('aria-label','删除方案 '+name.textContent);remove.onclick=()=>{try{const next=readPlans().filter(p=>p.id!==item.id);savePlans(next);notify('已从此浏览器删除该方案。');}catch(e){notify(e.message,true);}};row.append(load,remove);list.append(row);});}
$('importBtn').onclick=()=>$('importFile').click();$('importFile').onchange=async()=>{const file=$('importFile').files[0];if(!file)return;try{if(file.size>1024*1024)throw Error('方案文件不能超过 1 MB。');const data=JSON.parse(await file.text());if(data.version!==1||data.type!=='shou-run-studio-plan')throw Error('请选择本网站导出的方案 JSON。');const checked=normalize(data.config);makePath(checked);applyConfig(checked);fitRoute();generateNow();notify('方案已导入，点击保存可留在此浏览器。');}catch(e){notify('导入失败：'+e.message,true);}finally{$('importFile').value='';}};
$('helpBtn').onclick=()=>$('helpDialog').showModal();$('closeHelp').onclick=$('helpDone').onclick=()=>$('helpDialog').close();
applyConfig(defaults());renderSaved();fitRoute();generateNow(true);
