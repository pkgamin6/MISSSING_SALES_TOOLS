const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const modal=$("#modal"), modalTitle=$("#modalTitle"), modalBody=$("#modalBody");
function openModal(title,html){modalTitle.textContent=title;modalBody.innerHTML=html;modal.hidden=false}
function closeModal(){modal.hidden=true;modalBody.innerHTML=""}
$("#closeModal").onclick=closeModal;
modal.addEventListener("click",e=>{if(e.target===modal)closeModal()});

$$("[data-view]").forEach(b=>b.onclick=()=>{const id=b.dataset.view;$$(".view").forEach(v=>v.classList.toggle("active",v.id===id));$$(".nav-btn").forEach(n=>n.classList.toggle("active",n.dataset.view===id));window.scrollTo(0,0)});

function nums(text){return [...String(text||"").matchAll(/\d+/g)].map(x=>Number(x[0]));}
function sqlList(a){return a.map(n=>`'${n}'`).join(", ");}

function analyzeSequence(a){
  const missing=[],dupes=[],rollbacks=[],out=[];
  const seen=new Set();
  for(let i=0;i<a.length;i++){
    const n=a[i];
    if(seen.has(n))dupes.push({index:i+1,n});
    seen.add(n);
    if(i>0){
      const p=a[i-1];
      if(n>p+1)for(let x=p+1;x<n;x++)missing.push(x);
      if(n<p)rollbacks.push({row:i+1,previous:p,current:n});
      if(n<p)out.push({row:i+1,previous:p,current:n});
    }
  }
  return {missing:[...new Set(missing)],dupes,rollbacks,out};
}
function parseReceiptText(text){
  const lines=text.split(/\r?\n/), result=[];
  let header=-1;
  for(let i=0;i<Math.min(lines.length,30);i++)if(/receipt\s*#|receipt|fdocument_no|frecno/i.test(lines[i])){header=i;break}
  if(header>=0){
    const delim=lines[header].includes("\t")?"\t":lines[header].includes(",")?",":null;
    if(delim){const hs=lines[header].split(delim).map(x=>x.trim().toLowerCase()), idx=hs.findIndex(x=>/receipt|fdocument_no|frecno/.test(x));if(idx>=0)for(let i=header+1;i<lines.length;i++){const c=lines[i].split(delim)[idx]?.replace(/[^\d]/g,"");if(c)result.push(Number(c))}}
  }
  if(!result.length){for(const m of text.matchAll(/(?:receipt\s*#|fdocument_no|frecno)\s*[:=,]?\s*['"]?(\d+)/ig))result.push(Number(m[1]))}
  return result;
}
function missingModal(){
 openModal("Check Missing OR#",`<p class="note">Upload TXT, CSV, LOG, SQL or XLSX. Receipt#/fdocument_no/frecno values are read in row order.</p>
 <input id="mFile" type="file" accept=".txt,.csv,.log,.sql,.xlsx"><div class="actions"><button class="primary" id="mRun">Analyze</button><button class="danger" id="mClear">Clear</button></div>
 <pre id="mOut" class="output tall"></pre><textarea id="mSql" class="sql-area" readonly placeholder="Generated SQL will appear here"></textarea>
 <div class="actions"><button class="secondary" id="mSelect">Generate SELECT SQL</button><button class="secondary" id="mDelete">Generate DELETE SQL</button></div>`);
 let missing=[];
 $("#mClear").onclick=()=>{$("#mOut").textContent="";$("#mSql").value="";$("#mFile").value=""};
 $("#mRun").onclick=async()=>{const f=$("#mFile").files[0];if(!f)return $("#mOut").textContent="Please choose a file.";let a=[];
   if(f.name.toLowerCase().endsWith(".xlsx")){const wb=XLSX.read(await f.arrayBuffer(),{type:"array"});a=parseReceiptText(XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]))}
   else a=parseReceiptText(await f.text());
   const r=analyzeSequence(a);missing=r.missing;
   $("#mOut").textContent=`Detected OR#: ${a.length}\nMissing OR# (jumps): ${missing.length}\nDuplicate rows: ${r.dupes.length}\nRollback rows: ${r.rollbacks.length}\nOut-of-order rows: ${r.out.length}\n\nMissing values:\n${missing.join(", ")||"None"}`;
 };
 $("#mSelect").onclick=()=>{$("#mSql").value=missing.length?`SELECT *\nFROM pos_sale\nWHERE fdocument_no IN (\n${sqlList(missing)}\n);`:"-- No missing OR numbers found."};
 $("#mDelete").onclick=()=>{$("#mSql").value=missing.length?`DELETE FROM pos_sale\nWHERE fdocument_no IN (${sqlList(missing)});\n\nDELETE FROM pos_sale_payment\nWHERE frecno NOT IN (SELECT frecno FROM pos_sale);\n\nDELETE FROM pos_sale_product\nWHERE frecno NOT IN (SELECT frecno FROM pos_sale);`:"-- No missing OR numbers found."};
}
$("#openMissing").onclick=missingModal;

function latestFrecnoModal(){
 openModal("Generate Latest Frecno",`<p class="note">Enter old frecno values, one per line, and the latest starting frecno.</p>
 <div class="two"><label>Latest Frecno<input id="lfLatest" inputmode="numeric"></label><label>Old Frecno<textarea id="lfOld" class="sql-area"></textarea></label></div>
 <div class="actions"><button class="primary" id="lfRun">Generate</button><button class="danger" id="lfClear">Clear</button></div><textarea id="lfOut" class="sql-area" readonly></textarea><button class="secondary" id="lfCopy">Copy query</button>`);
 $("#lfRun").onclick=()=>{const latest=Number($("#lfLatest").value),old=nums($("#lfOld").value);if(!Number.isInteger(latest)||!old.length)return $("#lfOut").value="Enter a valid latest frecno and at least one old frecno.";
 const tables=["pos_sale","pos_sale_payment","pos_sale_product"],when=old.map((x,i)=>`    WHEN '${x}' THEN '${latest+i}'`).join("\n");
 $("#lfOut").value=tables.map(t=>`UPDATE ${t}\nSET frecno = CASE frecno\n${when}\nEND\nWHERE frecno IN (${sqlList(old)});`).join("\n\n");
 };
 $("#lfClear").onclick=()=>{$("#lfLatest").value="";$("#lfOld").value="";$("#lfOut").value=""};
 $("#lfCopy").onclick=()=>navigator.clipboard?.writeText($("#lfOut").value);
}
$("#openLatest").onclick=latestFrecnoModal;

function filterModal(){
 openModal("Frecno Filter SQL",`<label>Frecno List<textarea id="flIn" class="sql-area" placeholder="81342\n81343\n81344"></textarea></label>
 <div class="actions"><button class="secondary" id="flSI">SELECT IN</button><button class="secondary" id="flDI">DELETE IN</button><button class="secondary" id="flSNI">SELECT NOT IN</button><button class="secondary" id="flDNI">DELETE NOT IN</button><button class="danger" id="flC">Clear</button></div><textarea id="flOut" class="sql-area" readonly></textarea>`);
 const q=()=>{const a=[...new Set(nums($("#flIn").value))];return a.length?sqlList(a):""};
 const multi=(verb,cond)=>["pos_sale","pos_sale_payment","pos_sale_product"].map(t=>`${verb} * FROM ${t} WHERE frecno ${cond} (${q()});`).join("\n\n");
 $("#flSI").onclick=()=>$("#flOut").value=q()?multi("SELECT","IN"):"-- Enter frecno values.";
 $("#flDI").onclick=()=>$("#flOut").value=q()?multi("DELETE","IN"):"-- Enter frecno values.";
 $("#flSNI").onclick=()=>$("#flOut").value=q()?multi("SELECT","NOT IN"):"-- Enter frecno values.";
 $("#flDNI").onclick=()=>$("#flOut").value=q()?multi("DELETE","NOT IN"):"-- Enter frecno values.";
 $("#flC").onclick=()=>{$("#flIn").value="";$("#flOut").value=""};
}
$("#openFilter").onclick=filterModal;

$("#openScripts").onclick=()=>openModal("Generate All Script",`<h4>Check missing OR#</h4><pre class="output">SELECT MIN(fdocument_no), MAX(fdocument_no), COUNT(*) FROM pos_sale;\nSELECT frecno, COUNT(*) FROM pos_sale GROUP BY frecno HAVING COUNT(*) > 1;</pre><h4>Check orphan records</h4><pre class="output">SELECT * FROM pos_sale_payment WHERE frecno NOT IN (SELECT frecno FROM pos_sale);\nSELECT * FROM pos_sale_product WHERE frecno NOT IN (SELECT frecno FROM pos_sale);</pre>`);
