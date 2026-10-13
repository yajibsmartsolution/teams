/* Shared Operator / Dispatch workbooks. ExcelJS is bundled locally. */
(() => {
  'use strict';
  const colors = {navy:'0B2545',navy2:'123B6B',green:'0B6E4F',gold:'B98900',goldPale:'FFEDB3',ink:'1F2937',pale:'E9F1FA',stripe:'F6F9FC',border:'C7D4E2'};
  const bandColors = {A:'0B6E4F',B:'1764AD',C:'B88709',D:'C2560C',E:'B42318'};
  const excelJsUrl = document.currentScript?.src
    ? new URL('assets/exceljs-4.4.0.min.js', document.currentScript.src).href
    : '';
  let excelJsLoad;
  const fill = argb => ({type:'pattern',pattern:'solid',fgColor:{argb}});
  const number = value => {
    const text=String(value ?? '').trim();
    return /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(text) ? Number(text) : text;
  };
  function buildWorkbook(report) {
    const wb=new ExcelJS.Workbook();
    wb.creator='KEDCO System Operations'; wb.created=new Date();
    const ws=wb.addWorksheet(report.sheet,{properties:{tabColor:{argb:colors.green}},
      views:[{state:'frozen',ySplit:5,xSplit:report.freezeColumns??(report.loadflow?2:0)}],
      pageSetup:{orientation:'landscape',paperSize:report.loadflow?8:9,fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:5'}});
    const count=report.headers.length;
    ws.columns=report.widths.map(width=>({width}));
    [report.title,'KANO ELECTRICITY DISTRIBUTION COMPANY | SYSTEM OPERATIONS',report.subtitle].forEach((text,i)=>{
      ws.mergeCells(i+1,1,i+1,count); const cell=ws.getCell(i+1,1);cell.value=text;
      cell.fill=fill(i===0?colors.navy:i===1?colors.navy2:colors.green);
      cell.font={name:'Calibri',size:i===0?20:11,bold:true,color:{argb:'FFFFFF'}};
      cell.alignment={vertical:'middle',wrapText:true};ws.getRow(i+1).height=i===0?34:26;
    });
    ws.getRow(5).values=report.headers;ws.getRow(5).height=36;
    ws.getRow(5).eachCell(cell=>{
      cell.fill=fill(colors.gold);cell.font={name:'Calibri',bold:true,color:{argb:colors.navy}};
      cell.alignment={vertical:'middle',horizontal:'center',wrapText:true};
      cell.border={top:{style:'thin',color:{argb:colors.navy}},bottom:{style:'medium',color:{argb:colors.navy}},left:{style:'thin',color:{argb:colors.border}},right:{style:'thin',color:{argb:colors.border}}};
    });
    report.rows.forEach((values,i)=>{
      const row=ws.addRow(values);row.height=30;
      for(let c=1;c<=count;c++){
        const cell=row.getCell(c);cell.font={name:'Calibri',size:11,color:{argb:colors.ink}};
        cell.fill=fill(i%2?colors.stripe:'FFFFFF');cell.alignment={vertical:'middle',wrapText:true,horizontal:typeof cell.value==='number'?'right':'left'};
        cell.border={top:{style:'hair',color:{argb:colors.border}},bottom:{style:'hair',color:{argb:colors.border}},left:{style:'hair',color:{argb:colors.border}},right:{style:'hair',color:{argb:colors.border}}};
        if(typeof cell.value==='number')cell.numFmt=c===1?'0':'0.00';
        if(report.highlightColumns?.includes(c)){cell.fill=fill(colors.goldPale);cell.font.bold=true;cell.font.color={argb:'6B4E00'};}
        if(bandColors[String(cell.value).trim()]&&/^[A-E]$/.test(String(cell.value).trim())){cell.fill=fill(bandColors[cell.value.trim()]);cell.font={name:'Calibri',bold:true,color:{argb:'FFFFFF'}};cell.alignment.horizontal='center';}
        if(/^(OPEN|L\/F|E\/F|O\/S|FAULT)$/.test(String(cell.value))){cell.fill=fill('FCE4D6');cell.font.color={argb:'9C0006'};cell.font.bold=true;}
        if(/^(RESTORED|CLOSED)$/.test(String(cell.value))){cell.fill=fill('E2F0D9');cell.font.color={argb:'006100'};cell.font.bold=true;}
      }
    });
    if(report.loadflow)ws.views=[{state:'frozen',ySplit:5,xSplit:report.freezeColumns??2,showGridLines:false}];
    if(report.rows.length)ws.autoFilter={from:{row:5,column:1},to:{row:5+report.rows.length,column:count}};
    ws.headerFooter.oddFooter='&LKEDCO | '+report.sheet+'&RPage &P of &N';
    if(report.summary?.rows?.length){
      const summary=wb.addWorksheet('System Summary');
      summary.columns=report.summary.widths.map(width=>({width}));
      summary.addRow(report.summary.headers);
      report.summary.rows.forEach(row=>summary.addRow(row));
      summary.getRow(1).height=34;
      summary.getRow(1).eachCell(cell=>{cell.fill=fill(colors.navy);cell.font={name:'Calibri',size:11,bold:true,color:{argb:'FFFFFF'}};cell.alignment={vertical:'middle',horizontal:'center',wrapText:true};});
      for(let i=2;i<=summary.rowCount;i++){
        const row=summary.getRow(i);row.height=28;
        row.eachCell(cell=>{cell.fill=fill(i%2?colors.pale:'FFFFFF');cell.font={name:'Calibri',size:11,color:{argb:colors.ink}};cell.alignment={vertical:'middle',wrapText:true,horizontal:typeof cell.value==='number'?'right':'left'};cell.border={bottom:{style:'hair',color:{argb:'D7E2E9'}}};if(typeof cell.value==='number')cell.numFmt='0.00';});
      }
      summary.views=[{state:'frozen',xSplit:1,ySplit:1}];
    }
    const notes=wb.addWorksheet('Report Notes');notes.getColumn(1).width=110;
    [report.title,report.subtitle,'Generated: '+new Date().toLocaleString('en-GB'),
      report.loadflow?'Scope: visible feeder rows; System Summary retains the displayed system totals.':'Scope: current daily-log period and filters.',
      'Blank cells mean unavailable or not entered; zero is an actual numeric reading.',
      'Hourly readings: MW. Total energy: MWh. Load factor: percent. Operational codes remain text.',
      'Codes: L/S load shedding; L/F line fault; O/S out of service; E/F earth fault.'].forEach(text=>notes.addRow([text]));
    return wb;
  }
  function loadflowReport(form){
    if(typeof refreshKedcoLoadFlow==='function')refreshKedcoLoadFlow(form,'load33');
    const value=cell=>{const input=cell.querySelector('input');return number(input?input.value:cell.textContent);};
    const rows=[...form.querySelectorAll('tr[data-lf33-row]')].filter(row=>!row.hidden&&row.dataset.feeder).map(row=>[...row.cells].map(value));
    const date=form.elements.namedItem('lf33_date')?.value||'undated';
    return {sheet:'33 kV Load Flow',title:'33 kV FEEDERS LOAD FLOW',subtitle:'Reading date: '+date+' | Feeders: '+rows.length,
      filename:'KEDCO-33kV-Load-Flow-'+date+'.xlsx',loadflow:true,
      headers:['S/N','33 kV Feeder','Band','TCN Limit (MW)','Max Ever (MW)',...Array.from({length:24},(_,i)=>String(i+1).padStart(2,'0')+':00'),'Total (MWh)','Max Demand (MW)','Load Factor (%)'],
      widths:[7,28,9,14,14,...Array(24).fill(10),16,16,16],rows,highlightColumns:[30,31,32],freezeColumns:2,
      summary:{headers:['SYSTEM SUMMARY',...Array.from({length:24},(_,i)=>String(i+1).padStart(2,'0')+':00'),'Minimum','Average','Maximum'],widths:[42,...Array(24).fill(12),...Array(3).fill(14)],rows:[...form.querySelectorAll('tr[data-lf33-summary]')].map(row=>[...row.cells].map(value))}};
  }
  function loadflow11Report(form){
    if(typeof refreshKedcoLoadFlow==='function')refreshKedcoLoadFlow(form,'load11');
    const value=cell=>{const input=cell.querySelector('input');return number(input?input.value:cell.textContent);};
    const rows=[...form.querySelectorAll('tr[data-lf11-row][data-feeder="1"]')].filter(row=>!row.hidden).map(row=>[...row.cells].map(value));
    const date=form.elements.namedItem('lf11_date')?.value||'undated';
    const total=form.querySelector('[data-lf11-total]');
    const summaryRow=total?[
      'TOTAL 11 kV FEEDER LOAD',
      ...Array.from({length:24},(_,i)=>number(form.elements.namedItem(`lf11_total_h${i+1}`)?.value)),
      number(form.elements.namedItem('lf11_total_min')?.value),
      number(form.elements.namedItem('lf11_total_avg')?.value),
      number(form.elements.namedItem('lf11_total_peak')?.value)
    ]:null;
    return {sheet:'11 kV Load Flow',title:'11 kV FEEDERS LOAD FLOW',subtitle:'Reading date: '+date+' | Feeder rows: '+rows.length,
      filename:'KEDCO-11kV-Load-Flow-'+date+'.xlsx',loadflow:true,freezeColumns:6,
      headers:['S/N','Station','Transformer Rating','Transformer Peak Load (MW)','11 kV Feeder','Band',...Array.from({length:24},(_,i)=>String(i+1).padStart(2,'0')+':00'),'Minimum Load (MW)','Average Load (MW)','Peak Load (MW)','Previous Energy (MWh)','Present Energy (MWh)','Energy Variance (MWh)'],
      widths:[7,23,16,18,28,9,...Array(24).fill(10),16,16,16,18,18,18],rows,highlightColumns:[31,32,33,34,35,36],
      summary:{headers:['SYSTEM TOTAL',...Array.from({length:24},(_,i)=>String(i+1).padStart(2,'0')+':00'),'Minimum','Average','Peak'],widths:[34,...Array(24).fill(12),...Array(3).fill(14)],rows:summaryRow?[summaryRow]:[]}};
  }
  function dailyReport(form){
    const records=form.__dailyFilteredRows||form.__dailyRows||[];
    const date=form.querySelector('[data-daily-filter-date]')?.value||new Date().toLocaleDateString('en-CA');
    const period=form.querySelector('[data-daily-period]')?.value||'day';
    const label=typeof dailyPeriodRange==='function'?dailyPeriodRange(date,period).label:date;
    return {sheet:'Daily Operations Log',title:'DAILY OPERATIONS LOG',subtitle:label+' | Operations: '+records.length,
      filename:'KEDCO-Daily-Log-'+period+'-'+date+'.xlsx',
      headers:['S/N','Station / Source','Feeder / Apparatus','Opened','Closed / Restored','Operation / Reason','Load Lost (MW)','Elapsed Duration','Approved Duration','Downtime / Overtime','Status','Operator'],
      widths:[7,26,28,23,23,32,16,20,22,25,16,25],
      rows:records.map((r,i)=>[i+1,r.station||'',r.feeder||'',dailyFmtDate(r.opened_at),dailyFmtDate(r.closed_at),dailyOperationLabel(r.category),number(r.load_lost_mw),dailyDuration(r.opened_at,r.closed_at)||'ONGOING',dailyRequiresDuration(r.category)?dailyPlannedDurationLabel(r):'',dailyRequiresDuration(r.category)?dailyCountdownState(r).text:'',r.status==='closed'?'RESTORED':'OPEN',r.operator||''])};
  }
  function ensureExcelJS(){
    if(window.ExcelJS)return Promise.resolve();
    if(excelJsLoad)return excelJsLoad;
    if(!excelJsUrl)return Promise.reject(new Error('Excel export library path is unavailable.'));
    excelJsLoad=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src=excelJsUrl;
      script.onload=()=>window.ExcelJS?resolve():reject(new Error('Excel export library failed to initialize.'));
      script.onerror=()=>{excelJsLoad=null;reject(new Error('Excel export library could not load. Check the local assets folder and try again.'))};
      document.head.appendChild(script);
    });
    return excelJsLoad;
  }
  async function exportForm(form,button){
    if(button?.disabled)return;
    if(button)button.disabled=true;
    try{
      await ensureExcelJS();
      const report=form.dataset.form==='load33'?loadflowReport(form):form.dataset.form==='load11'?loadflow11Report(form):dailyReport(form);
      const data=await buildWorkbook(report).xlsx.writeBuffer();
      const url=URL.createObjectURL(new Blob([data],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
      const a=document.createElement('a');a.href=url;a.download=report.filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
    }catch(error){console.error(error);alert('Excel export failed: '+error.message);}finally{if(button)button.disabled=false;}
  }
  function updateButton(){
    const button=document.getElementById('exportForm'),form=document.querySelector('#formCanvas form');
    if(button){const label=['daily','load33','load11'].includes(form?.dataset.form)?'Export Excel':'Export JSON';if(button.textContent!==label)button.textContent=label;}
    document.querySelectorAll('form[data-form="daily"] .daily-log-toolbar').forEach(bar=>{
      if(bar.querySelector('[data-daily-export]'))return;
      const b=document.createElement('button');b.type='button';b.dataset.dailyExport='';b.className='daily-export small';b.textContent='Export Excel';bar.appendChild(b);
    });
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('#exportForm,[data-daily-export]');if(!button)return;
    const form=button.closest('form')||document.querySelector('#formCanvas form');
    if(!['load33','load11','daily'].includes(form?.dataset.form))return;
    event.preventDefault();event.stopImmediatePropagation();exportForm(form,button);
  },true);
  function start(){updateButton();new MutationObserver(updateButton).observe(document.body,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
  window.KEDCOOperationsExcel={buildWorkbook,loadflowReport,loadflow11Report,dailyReport,ensureExcelJS};
})();
