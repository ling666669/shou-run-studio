import {expandDates,planBatch,generateBatchItem,batchReport} from './batch-core.js';
import {createZip} from './zip.js';
import {formatDuration,formatPace} from './engine.js';

export function initBatch({readBaseConfig,download,notify,preview}){
  const $=id=>document.getElementById(id);let running=false,cancelled=false,results=[],failed=[];
  const ids=['batchDates','batchKmMin','batchKmMax','batchPaceMin','batchPaceMax','batchTimeFrom','batchTimeTo','batchWeight','batchSeed'];
  const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
  function updateDates(){try{const dates=expandDates($('batchDates').value);$('batchDateCount').textContent=`已选 ${dates.length} 天 · 每天一个 FIT`;}catch(e){$('batchDateCount').textContent=e.message;}}
  function appendDates(from,to=from){const incoming=expandDates(to===from?from:from+'..'+to);const previous=$('batchDates').value.trim();const merged=expandDates([previous,...incoming].filter(Boolean).join('\n'));$('batchDates').value=merged.join('\n');updateDates();markChanged();}
  function markChanged(){if(results.length)$('batchStatus').textContent='设置已更改；下方文件仍是上一次生成结果，请重新生成以应用新设置。';}
  for(const id of ids)$(id).addEventListener('input',()=>{if(id==='batchDates')updateDates();markChanged();});
  $('batchAddDate').onclick=()=>{try{appendDates($('batchPickDate').value);}catch(e){notify(e.message,true);}};
  $('batchAddRange').onclick=()=>{try{appendDates($('batchRangeStart').value,$('batchRangeEnd').value);}catch(e){notify(e.message,true);}};
  $('batchClearDates').onclick=()=>{$('batchDates').value='';updateDates();markChanged();};
  $('batchNewSeed').onclick=()=>{$('batchSeed').value=crypto.getRandomValues(new Uint32Array(1))[0]%2147483647;markChanged();};
  const initial=readBaseConfig();$('batchPickDate').value=$('batchRangeStart').value=$('batchRangeEnd').value=initial.date;
  $('batchDates').value=initial.date;$('batchSeed').value=initial.seed;
  function setBusy(value){running=value;for(const el of $('batchForm').querySelectorAll('input,textarea,button,select'))el.disabled=value;$('batchCancelBtn').hidden=!value;$('batchZipBtn').disabled=value||!results.length;$('batchReportBtn').disabled=value||!results.length;}
  function addRow(item,result,error){
    const row=document.createElement('tr');
    const cells=result?[item.config.date,item.config.time,(result.total.metres/1000).toFixed(3),formatDuration(result.total.seconds),formatPace(result.total.pace),`${result.total.avgHr} / ${result.total.avgCadence.toFixed(0)}`,result.splits.map(p=>formatPace(p.pace)).join(' · ')]:[item.config.date,item.config.time,'—','—','—','—',error];
    cells.forEach((text,i)=>{const cell=document.createElement(i===0?'th':'td');if(i===0)cell.scope='row';cell.textContent=text;row.append(cell);});
    const actions=document.createElement('td');
    if(result){const fit=document.createElement('button');fit.textContent='FIT ↓';fit.setAttribute('aria-label','下载 '+item.config.date+' FIT');fit.onclick=()=>download(result.file,result.bytes,'application/octet-stream');const view=document.createElement('button');view.textContent='预览';view.setAttribute('aria-label','预览 '+item.config.date);view.onclick=()=>preview(result.config);actions.append(view,fit);}
    else{row.className='batch-error';const status=document.createElement('span');status.textContent='生成失败';actions.append(status);}
    row.append(actions);$('batchRows').append(row);
  }
  $('batchForm').onsubmit=async event=>{
    event.preventDefault();if(running)return;
    let plan;
    try{plan=planBatch(readBaseConfig(),{dates:$('batchDates').value,kmMin:$('batchKmMin').value,kmMax:$('batchKmMax').value,paceMin:$('batchPaceMin').value,paceMax:$('batchPaceMax').value,timeFrom:$('batchTimeFrom').value,timeTo:$('batchTimeTo').value,seed:$('batchSeed').value,weight:$('batchWeight').value});}
    catch(e){notify(e.message,true);$('batchStatus').textContent=e.message;return;}
    results=[];failed=[];cancelled=false;$('batchRows').replaceChildren();$('batchResults').hidden=false;setBusy(true);
    $('batchProgress').max=plan.items.length;$('batchProgress').value=0;
    for(let i=0;i<plan.items.length;i++){
      $('batchStatus').textContent=`正在生成 ${i+1}/${plan.items.length}：${plan.items[i].config.date}…`;
      await pause();if(cancelled)break;
      const item=plan.items[i];
      try{const result=generateBatchItem(item);results.push(result);addRow(item,result);}
      catch(e){failed.push({date:item.config.date,error:e.message});addRow(item,null,e.message);}
      $('batchProgress').value=i+1;
    }
    const stopped=plan.items.length-results.length-failed.length;
    setBusy(false);$('batchStatus').textContent=`${cancelled?'已停止。':'生成完成。'}成功 ${results.length} 份，失败 ${failed.length} 份${stopped?`，未生成 ${stopped} 份`:''}。每份文件均单独校验。`;
    if(cancelled)failed.push(...plan.items.slice(results.length+failed.length).map(item=>({date:item.config.date,error:'用户停止，未生成'})));
    notify(results.length?`已生成 ${results.length} 个 FIT，可单独下载或打包。`:'没有生成可下载的文件，请检查参数或路线。',!results.length);
  };
  $('batchCancelBtn').onclick=()=>{cancelled=true;$('batchStatus').textContent='正在停止，已完成的文件仍可下载…';};
  $('batchReportBtn').onclick=()=>{if(results.length)download('SIMULATED_BATCH_REPORT.json',batchReport(results,failed),'application/json');};
  $('batchZipBtn').onclick=()=>{
    if(running||!results.length)return;
    try{const zip=createZip([...results.map(r=>({name:r.file,data:r.bytes})),{name:'SIMULATED_BATCH_REPORT.json',data:batchReport(results,failed)}]);download(`SIMULATED_SHOU_BATCH_${results[0].config.date.replaceAll('-','')}_${results.length}_FILES.zip`,zip,'application/zip');notify(`已打包 ${results.length} 个 FIT 和数据报告。`);}catch(e){notify('打包失败：'+e.message,true);}
  };
  updateDates();
}
