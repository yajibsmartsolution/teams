// Isolated browser regression: synthetic records only, no backend writes.
const fs=require('fs'),os=require('os'),path=require('path');
const {pathToFileURL}=require('url'),{execFileSync}=require('child_process');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'kedco-operations-'));
const pages=['dispatch','operator'].map(page=>fs.readFileSync(`frontend/pages/system-operations/${page}.html`,'utf8'));
const excelExporter=fs.readFileSync('frontend/kedco-operations-excel.js','utf8');
if(!pages[0].includes('kedco-operations-excel.js')||pages[0].includes('src="../../assets/exceljs-4.4.0.min.js"')||!excelExporter.includes('ensureExcelJS'))throw Error('Dispatch ExcelJS dependency is not lazy-loaded.');
for(const page of pages)for(const m of page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/\bsrc=|application\/json/i.test(m[1]))new Function(m[2]);
const realtime=fs.readFileSync('frontend/kedco-realtime-loadflow-v2.js','utf8');new Function(realtime);
const listener=realtime.match(/document.addEventListener\("kedco:loadflow-updated",e=>\{[\s\S]*?\n    \},true\);/)[0];
const pasteHelper=pages[0].slice(pages[0].indexOf('function lfSetPastedValue('),pages[0].indexOf('function lfUsefulColumn('));
const source=name=>fs.readFileSync('frontend/'+name,'utf8');
const runPasteRegression=process.env.KEDCO_SKIP_PASTE_REGRESSION!=='1';
const html=`<!doctype html><meta charset="utf-8"><div id="formCanvas"><form data-form="load33"><input name="lf33_date" value="2026-09-25"><table><tbody><tr data-lf33-row="83" data-feeder="TEXTILE"><td>83</td><td>TEXTILE</td><td>A</td><td></td><td>11</td>${Array.from({length:24},(_,i)=>`<td><input name="lf33_r83_h${i+1}" data-lf33-reading data-hour="${i+1}" data-row="83"></td>`).join('')}<td><input value="44"></td><td><input value="9"></td><td><input value="20.37"></td></tr></tbody></table></form></div><button id="exportForm">Export JSON</button><pre id="result">RUNNING</pre>
<script>
const assert=(v,m)=>{if(!v)throw Error(m)};
const form=document.querySelector('form');
let lfExtract33HoursAfterFeeder=values=>values.slice(0,24);
function lfNormFeeder(v){return String(v).toUpperCase().replace(/[^A-Z0-9]/g,'')}
function refreshKedcoLoadFlow(){} function set33PasteStatus(){}
function serializeForm(f){return Object.fromEntries(new FormData(f))}
const canEditLive=true,FORM_IDS=new Set(['load33']);const formFor=()=>form,formMode=()=>form.dataset.kedcoLoadflowMode||'live';
let published=0,buffer={};function persistDirtyBuffer(){buffer=serializeForm(form)}function overlayLocalStateFromForm(){}function schedulePublish(){published++}
${listener}
${pasteHelper}
</script><script>${source('kedco-loadflow-row-paste.js')}</script><script src="${pathToFileURL(path.resolve('frontend/kedco-operations-excel.js')).href}"></script>
<script>(async()=>{try{
const values=Array.from({length:24},(_,i)=>i===3?'L/S':i===4?'':String(i));
const extraction=KEDCOLoadflowRowPaste.hoursAfterFeeder(['A','','11',...values,'400','23','70']);
assert(JSON.stringify(extraction)===JSON.stringify(values),'full row metadata excluded');
assert(KEDCOLoadflowRowPaste.hoursAfterFeeder(['A',...values])[0]==='0','band-only row');
form.elements.lf33_r83_h1.value='0';form.elements.lf33_r83_h4.value='L/S';form.elements.lf33_r83_h24.value='23';
if(${runPasteRegression}){
const input=form.querySelector('[data-hour="8"]');
const event=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{getData:()=>['83','TEXTILE','A','','11',...values,'400','23','70'].join('\t')}});input.dispatchEvent(event);
assert(form.elements.lf33_r83_h1.value==='0','full row begins at H01 even when pasted into H08');
assert(form.elements.lf33_r83_h24.value==='23','last hour preserved');
assert(form.elements.lf33_r83_h4.value==='L/S','operational code preserved');
assert(buffer.lf33_r83_h24==='23'&&published>0,'paste queues persistence of last Textile hour');
}
const before=published;document.dispatchEvent(new CustomEvent('kedco:loadflow-updated',{detail:{formId:'load33'}}));assert(published===before+1,'document draft notification reaches durable saver once');
form.dataset.kedcoLoadflowMode='reference';document.dispatchEvent(new CustomEvent('kedco:loadflow-updated',{detail:{formId:'load33'}}));assert(published===before+1,'historical sheet not saved');delete form.dataset.kedcoLoadflowMode;
assert(!window.ExcelJS,'ExcelJS is not downloaded during page startup');
const exportButton=document.getElementById('exportForm');let exportedFilename='';window.URL.createObjectURL=()=> 'blob:kedco-export-test';window.URL.revokeObjectURL=()=>{};HTMLAnchorElement.prototype.click=function(){exportedFilename=this.download};
const exportFinished=new Promise((resolve,reject)=>{const observer=new MutationObserver(()=>{if(!exportButton.disabled&&window.ExcelJS){clearTimeout(timeout);observer.disconnect();resolve()}});observer.observe(exportButton,{attributes:true,attributeFilter:['disabled']});const timeout=setTimeout(()=>{observer.disconnect();reject(Error('Lazy ExcelJS export did not finish'))},5000)});
exportButton.click();await exportFinished;assert(exportedFilename==='KEDCO-33kV-Load-Flow-2026-09-25.xlsx','ExcelJS loads on demand and exports the expected workbook');
const report=KEDCOOperationsExcel.loadflowReport(form);assert(report.rows[0][5]===0,'zero remains numeric');assert(report.rows[0][9]==='','blank remains blank');
const wb=KEDCOOperationsExcel.buildWorkbook(report),binary=await wb.xlsx.writeBuffer();
const read=new ExcelJS.Workbook();await read.xlsx.load(binary);const sheet=read.getWorksheet('33 kV Load Flow');
assert(sheet.getCell('B6').value==='TEXTILE','feeder survives xlsx round trip');assert(sheet.getCell('F6').value===0,'numeric reading survives');assert(sheet.getCell('I6').value==='L/S','code survives');assert(sheet.getCell('AC6').value===23,'24th hour survives');
assert(sheet.getCell('A1').fill.fgColor.argb==='17365D','navy title retained');assert(sheet.getCell('AD6').fill.fgColor.argb==='FFF2CC','gold total retained');assert(sheet.views[0].ySplit===5,'frozen headers retained');assert(sheet.autoFilter,'filter retained');
const load11=document.createElement('form');load11.dataset.form='load11';
const hourly11=Array.from({length:24},(_,i)=>'<td><input name="lf11_r52_h'+(i+1)+'" value="'+(i===0?'0':i===1?'':i===3?'LS':i===23?'23.5':'')+'"></td>').join('');
const stats11=['min:0','avg:5.25','peak:23.5','prev:100','present:110','variance:10'].map(item=>{const [kind,value]=item.split(':');return '<td><input name="lf11_r52_'+kind+'" value="'+value+'"></td>'}).join('');
const total11=Array.from({length:24},(_,i)=>'<input name="lf11_total_h'+(i+1)+'" value="'+(i===0?'100':i===23?'220':'')+'">').join('');
load11.innerHTML='<input name="lf11_date" value="2026-09-25"><input name="lf11_total_min" value="100"><input name="lf11_total_avg" value="160"><input name="lf11_total_peak" value="220">'+total11+'<table><tbody><tr data-lf11-row="52" data-feeder="1"><td>52</td><td>Funtua</td><td>15 MVA TR1</td><td>2.50</td><td>TEXTILE</td><td>A</td>'+hourly11+stats11+'</tr><tr data-lf11-total></tr></tbody></table>';
const report11=KEDCOOperationsExcel.loadflow11Report(load11);assert(report11.rows[0][6]===0,'11 kV zero reading remains numeric');assert(report11.rows[0][7]==='','11 kV blank remains blank');assert(report11.rows[0][9]==='LS','11 kV operational code remains text');assert(report11.rows[0][29]===23.5,'11 kV H24 survives');assert(report11.rows[0][34]===110,'11 kV present energy survives');
const book11=KEDCOOperationsExcel.buildWorkbook(report11),binary11=await book11.xlsx.writeBuffer(),read11=new ExcelJS.Workbook();await read11.xlsx.load(binary11);const sheet11=read11.getWorksheet('11 kV Load Flow');
assert(sheet11.getCell('B6').value==='Funtua','11 kV station survives XLSX round trip');assert(sheet11.getCell('G6').value===0,'11 kV zero survives XLSX round trip');assert(sheet11.getCell('H6').value==='','11 kV blank survives XLSX round trip');assert(sheet11.getCell('J6').value==='LS','11 kV code survives XLSX round trip');assert(sheet11.getCell('AD6').value===23.5,'11 kV H24 survives XLSX round trip');assert(sheet11.getCell('AE6').fill.fgColor.argb==='FFF2CC','11 kV result columns are highlighted');assert(sheet11.views[0].xSplit===6&&sheet11.views[0].ySplit===5,'11 kV identifiers and headers remain frozen');assert(sheet11.autoFilter,'11 kV filter retained');
const summary11=read11.getWorksheet('System Summary');assert(summary11.getCell('B2').value===100&&summary11.getCell('Y2').value===220,'11 kV system totals retained in summary sheet');
window.dailyFmtDate=v=>v||'';window.dailyOperationLabel=v=>v;window.dailyDuration=()=> '01:00:00';window.dailyRequiresDuration=()=>false;
const daily=document.createElement('form');daily.__dailyFilteredRows=[{station:'Funtua',feeder:'Textile',load_lost_mw:0,status:'closed',category:'fault'}];
const dailyReport=KEDCOOperationsExcel.dailyReport(daily);assert(dailyReport.rows[0][6]===0,'daily zero MW retained');const dailyBook=KEDCOOperationsExcel.buildWorkbook(dailyReport);const dailyRead=new ExcelJS.Workbook();await dailyRead.xlsx.load(await dailyBook.xlsx.writeBuffer());assert(dailyRead.getWorksheet('Daily Operations Log').getCell('K6').value==='RESTORED','daily status retained');
daily.__dailyFilteredRows=[];assert(KEDCOOperationsExcel.dailyReport(daily).rows.length===0,'empty filtered result retained');
document.getElementById('result').textContent='PASS: both page scripts; 33/11 kV XLSX values, zero/code/blank/H24, summaries, colors, freeze panes and filters; daily log; realtime persistence.';
}catch(e){document.getElementById('result').textContent='FAIL: '+e.stack}})();</script>`;
const file=path.join(folder,'test.html');fs.writeFileSync(file,html);
let output;
try{output=execFileSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless','--disable-gpu','--no-first-run','--disable-background-networking','--user-data-dir='+path.join(folder,'profile'),'--dump-dom','--virtual-time-budget=8000',pathToFileURL(file).href],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe'],maxBuffer:10000000});}catch(e){if(e.code!=='ETIMEDOUT'||!/<pre id="result">(?:PASS|FAIL):/.test(e.stdout||''))throw e;output=e.stdout;}
const result=output.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1];console.log(result||'FAIL: no browser result');if(!result?.startsWith('PASS:'))process.exitCode=1;
