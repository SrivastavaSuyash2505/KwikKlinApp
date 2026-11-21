(() => {
"use strict";
const $c=id=>document.getElementById(id);
const esc=v=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=v=>{const n=Number(v);return Number.isFinite(n)?new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(n):"—"};
const num=v=>new Intl.NumberFormat("en-IN",{maximumFractionDigits:1}).format(Number(v||0));
const empty=t=>'<div class="costing-empty">'+esc(t)+'</div>';
async function loadCostingWorkbench(){
 const loading=$c("costing-loading"),content=$c("costing-content"),error=$c("costing-error"); if(!loading||!content)return;
 loading.hidden=false;content.hidden=true;error.hidden=true;
 try{const p=$c("costing-period")?.value||"90d";const d=await api("/admin/api/costing-workbench?period="+encodeURIComponent(p));render(d);loading.hidden=true;content.hidden=false;loadBusinessAdvisor();loadCostingAI(false);return true}
 catch(e){loading.hidden=true;error.hidden=false;error.textContent="Costing data load nahi hua: "+(e?.message||"Please retry.");return false}
}
/* Button par dikhe ki kaam ho raha hai, aur baad mein ki ho gaya */
async function refreshData(){
 const btn=$c("costing-refresh"),old=btn.textContent;
 btn.disabled=true;btn.textContent="Refreshing…";
 const ok=await loadCostingWorkbench();
 btn.disabled=false;btn.textContent=old;
 if(ok)toast("Costing data updated");
}
function stat(label,value){return '<div class="costing-stat"><span>'+esc(label)+'</span><b>'+esc(value)+'</b></div>'}
function render(d){
 $c("costing-period-label").textContent="Period: "+d.period+" ("+d.start_date+" to "+d.end_date+"). Calculations use recorded data only.";
 $c("costing-kpis").innerHTML=[["Recorded expenses",money(d.expense_total),num(d.expense_rows)+" expense records"],["Delivered orders",num(d.delivered_orders),"Completed orders"],["Recognized line items",num(d.recognized_order_lines),num(d.unclassified_order_lines)+" unclassified"],["Rate cost coverage",num(d.rate_coverage_pct)+"%",num(d.rates_with_cost)+" of "+num(d.active_rates)+" active rates"]].map(x=>'<article class="costing-kpi"><span>'+esc(x[0])+'</span><strong>'+esc(x[1])+'</strong><small>'+esc(x[2])+'</small></article>').join("");
 const checks=[{ok:d.has_expenses,title:d.has_expenses?"Expense history found":"No expenses recorded",detail:d.has_expenses?"Recorded total: "+money(d.expense_total):"Add actual expenses; missing data is not zero cost."},{ok:d.has_orders,title:d.has_orders?"Delivered orders found":"No delivered orders",detail:num(d.delivered_orders)+" delivered orders in this period."},{ok:Number(d.active_rates)>0&&Number(d.rates_missing_cost)===0,title:Number(d.rates_missing_cost)===0&&Number(d.active_rates)>0?"Rate costs configured":"Rate-card costs need attention",detail:num(d.rates_missing_cost)+" active rates missing configured cost."},{ok:Number(d.unclassified_order_lines)===0,title:Number(d.unclassified_order_lines)===0?"Order lines classified":"Some order lines unclassified",detail:num(d.unclassified_order_lines)+" lines need service, garment, quantity and unit."}];
 const score=Math.round(checks.filter(x=>x.ok).length/checks.length*100);$c("costing-readiness-badge").textContent=score+"% ready";
 $c("costing-readiness").innerHTML=checks.map(x=>'<div class="costing-check"><span class="'+(x.ok?"good":"needs")+'">'+(x.ok?"✓":"!")+'</span><div><b>'+esc(x.title)+'</b><small>'+esc(x.detail)+'</small></div></div>').join("");
 const cats=d.expense_by_category||[],max=Math.max(1,...cats.map(x=>Number(x.amount)||0));
 $c("costing-categories").innerHTML=cats.length?cats.map(x=>'<div class="costing-bar-row"><div><span>'+esc(x.category)+'</span><b>'+esc(money(x.amount))+'</b></div><div class="costing-bar"><i style="width:'+Math.min(100,Math.max(0,Number(x.amount)||0)/max*100)+'%"></i></div></div>').join(""):empty("No expense categories in this period.");
 const months=d.monthly||[],maxOrders=Math.max(1,...months.map(x=>Number(x.delivered_orders)||0));
 $c("costing-monthly").innerHTML=months.length?'<div class="costing-months">'+months.map(x=>'<div class="costing-month"><b>'+esc(String(x.month||"").slice(5))+'</b><div class="costing-mini-bar"><i style="height:'+Math.max(3,(Number(x.delivered_orders)||0)/maxOrders*100)+'%"></i></div><span>'+esc(money(x.expense_total))+'</span><small>'+num(x.delivered_orders)+' orders</small></div>').join("")+'</div>':empty("Monthly history will appear when records exist.");
 $c("costing-rates").innerHTML=stat("Active rates",num(d.active_rates))+stat("With configured cost",num(d.rates_with_cost))+stat("Missing cost",num(d.rates_missing_cost))+stat("Coverage",num(d.rate_coverage_pct)+"%");
 const vols=new Map((d.volume||[]).map(x=>[(String(x.service)+"|"+String(x.garment)+"|"+String(x.unit)).toLowerCase(),x]));
 const rates=d.rate_card||[];
 $c("costing-rate-rows").innerHTML=rates.length?rates.map(r=>{const v=vols.get((String(r.service)+"|"+String(r.garment)+"|"+String(r.unit)).toLowerCase());const contribution=r.price!=null&&r.cost!=null?Number(r.price)-Number(r.cost):null;return '<tr><td>'+esc(r.service)+'</td><td>'+esc(r.garment||"—")+'</td><td>'+esc(r.unit||"—")+'</td><td>'+esc(v?num(v.qty):"—")+'</td><td>'+esc(r.price==null?"Missing":money(r.price))+'</td><td>'+esc(r.cost==null?"Missing":money(r.cost))+'</td><td class="'+(contribution!=null&&contribution<0?"costing-negative":"")+'">'+esc(contribution==null?"Unavailable":money(contribution))+'</td></tr>'}).join(""):'<tr><td colspan="7">No active rates found.</td></tr>';
 const actions=[];if(!d.has_expenses)actions.push(["Start expense tracking","Record each actual expense with category, amount and date."]);if(Number(d.rates_missing_cost)>0)actions.push(["Complete rate-card costs",num(d.rates_missing_cost)+" active rates lack a configured cost."]);if(Number(d.unclassified_order_lines)>0)actions.push(["Fix order-line data",num(d.unclassified_order_lines)+" delivered lines need service/garment/quantity/unit data."]);if(Number(d.rate_coverage_pct)<80)actions.push(["Improve coverage","Prioritize costs for frequently sold services before changing prices."]);if(Number(d.delivered_orders)<10)actions.push(["Build a larger sample","Fewer than 10 delivered orders: treat patterns as early signals."]);if(!actions.length)actions.push(["Validate before repricing","Compare rate costs with actual chemicals, labour, utilities, delivery and outsourced work."]);actions.push(["Keep overhead separate","Define a defensible allocation basis before claiming net profit per garment."]);
 $c("costing-recommendations").innerHTML=actions.map((x,i)=>'<div class="costing-action"><span>'+String(i+1).padStart(2,"0")+'</span><div><b>'+esc(x[0])+'</b><p>'+esc(x[1])+'</p></div></div>').join("");
 $c("costing-warning").textContent="Accuracy note: "+(d.allocation_warning||"Costs are estimates spread by effort units. Contribution is not audited profit.");
}
window.loadCostingWorkbench=loadCostingWorkbench;

async function loadBusinessAdvisor(){
 const content=$c("advisor-content"),error=$c("advisor-error"); if(!content)return;
 error.hidden=true;
 try{const period=$c("costing-period")?.value||"90d";const d=await api("/admin/api/business-advisor?period="+encodeURIComponent(period));renderBusinessAdvisor(d);content.hidden=false}
 catch(e){error.hidden=false;error.textContent="Business Advisor data load nahi hua: "+(e?.message||"Please retry.");}
}
function renderBusinessAdvisor(d){
 const f=d.finance||{}, c=d.customers||{}, k=d.costing||{};
 const kpis=[["Delivered revenue",money(f.delivered_revenue),"Delivered bills in selected period"],["Recorded expenses",money(f.recorded_expenses),num(f.expense_records)+" expense records"],["Operating result estimate",money(f.operating_result_estimate),"Revenue minus recorded expenses only"],["Outstanding on delivered",money(f.outstanding_on_delivered),"Amount still due on delivered bills"]];
 $c("advisor-finance-kpis").innerHTML=kpis.map((x,i)=>'<article class="costing-kpi '+(i===2?'advisor-result':'')+'"><span>'+esc(x[0])+'</span><strong class="'+(i===2&&Number(f.operating_result_estimate)<0?'advisor-negative':'')+'">'+esc(x[1])+'</strong><small>'+esc(x[2])+'</small></article>').join("");
 $c("advisor-customer-stats").innerHTML=[["Customers with delivered orders",num(c.customers_with_delivered_orders)],["Repeat customers (2+ orders)",num(c.repeat_customers)],["One-time customers",num(c.one_time_customers)],["Repeat rate in selected period",num(c.repeat_rate_pct)+"%"]].map(x=>'<div class="advisor-metric"><span>'+esc(x[0])+'</span><b>'+esc(x[1])+'</b></div>').join("");
 $c("advisor-customer-note").textContent=c.note||"";
 const anomalies=d.expense_anomalies||[];
 $c("advisor-anomalies").innerHTML=anomalies.length?anomalies.map(x=>'<div class="advisor-row"><b>'+esc(x.category)+' · '+esc(money(x.amount))+'</b><small>'+esc(x.date||"Date unavailable")+' · Category median '+esc(money(x.category_median))+'</small><small>'+esc(x.reason)+'</small></div>').join(""):empty("No high-confidence anomaly flags. Categories with fewer than 3 records are not assessed.");
 const rates=k.rates||[];
 $c("advisor-rate-rows").innerHTML=rates.length?rates.map(r=>'<tr><td>'+esc(r.service)+'</td><td>'+esc(r.garment||"—")+'</td><td>'+esc(r.unit||"—")+'</td><td>'+esc(money(r.price))+'</td><td>'+esc(r.configured_cost==null?"Missing":money(r.configured_cost))+'</td><td class="'+(r.contribution!=null&&Number(r.contribution)<0?"costing-negative":"")+'">'+esc(r.contribution==null?"Unavailable":money(r.contribution))+'</td><td>'+esc(r.contribution_pct==null?"Unavailable":num(r.contribution_pct)+"%")+'</td></tr>').join(""):'<tr><td colspan="7">No active rate card entries found.</td></tr>';
 const actions=d.action_plan||[];
 $c("advisor-action-plan").innerHTML=actions.length?actions.map((x,i)=>'<div class="costing-action"><span>'+String(i+1).padStart(2,"0")+'</span><div><small class="advisor-priority '+(x.priority==="High"?"high":"")+'">'+esc(x.priority)+'</small><b>'+esc(x.title)+'</b><p>'+esc(x.detail)+'</p></div></div>').join(""):empty("No action plan available.");
 $c("advisor-finance-warning").textContent=f.warning||"Financial figures depend on the completeness of stored records.";
}

/* Phase 3 · AI next actions — upar wale niyam (render) turant dikhte hain; AI ka
   jawab aate hi unki jagah. Server hi tay karta hai AI ya rules (costing_ai.py). */
const cap=s=>String(s||"").charAt(0).toUpperCase()+String(s||"").slice(1);
const when=iso=>{const t=new Date(iso);return isNaN(t)?"":t.toLocaleString("en-IN",{day:"numeric",month:"short",hour:"numeric",minute:"2-digit"})};
async function loadCostingAI(refresh){
 const box=$c("costing-recommendations"),badge=$c("costing-ai-badge"),meta=$c("costing-ai-meta"),btn=$c("costing-ai-refresh"); if(!box||!badge)return;
 const label=btn?btn.textContent:"";
 badge.textContent="Asking AI…";badge.className="costing-badge";meta.textContent="AI is reading your numbers for this period…";if(btn){btn.disabled=true;btn.textContent="Asking AI…"}
 try{const p=$c("costing-period")?.value||"90d";const d=await api("/admin/api/costing-ai?period="+encodeURIComponent(p)+(refresh?"&refresh=true":""));renderCostingAI(d);
  if(refresh)toast(d.retry_minutes?"These suggestions are recent and your data has not changed. Ask again in "+d.retry_minutes+" min.":d.source==="ai"?"AI suggestions updated":(d.note||"Showing rule-based suggestions"),d.source!=="ai"&&!d.retry_minutes)}
 catch(e){badge.textContent="Rules";badge.className="costing-badge rules";meta.textContent="AI suggestions did not load ("+(e?.message||"please retry")+"). Showing rule-based suggestions.";if(refresh)toast(e?.message||"AI suggestions did not load",true)}
 finally{if(btn){btn.disabled=false;btn.textContent=label}}
}
function renderCostingAI(d){
 const ai=d.source==="ai";
 $c("costing-ai-badge").textContent=ai?"AI · from your data":"Rules";
 $c("costing-ai-badge").className="costing-badge "+(ai?"ai":"rules");
 $c("costing-ai-meta").textContent=[ai?"Generated "+when(d.generated_at)+(d.cached?" · saved, refreshes when your data changes":"")+" · "+(d.period||""):"",d.note||""].filter(Boolean).join(" · ");
 const sum=$c("costing-ai-summary");sum.textContent=d.summary||"";sum.hidden=!d.summary;
 const acts=d.actions||[];
 $c("costing-recommendations").innerHTML=acts.length?acts.map((x,i)=>'<div class="costing-action"><span>'+String(i+1).padStart(2,"0")+'</span><div><small class="advisor-priority '+(x.priority==="high"?"high":"")+'">'+esc(cap(x.priority))+(ai?" · "+esc(cap(x.area)):"")+'</small><b>'+esc(x.title)+'</b><p>'+esc(x.detail)+'</p>'+((x.evidence||[]).length?'<div class="costing-evidence">'+x.evidence.map(e=>'<span><small>'+esc(e.label)+'</small>'+esc(e.value)+'</span>').join("")+'</div>':"")+'</div></div>').join(""):empty("No suggestions for this period.");
}
window.loadCostingAI=loadCostingAI;

document.addEventListener("DOMContentLoaded",()=>{$c("costing-refresh")?.addEventListener("click",refreshData);$c("costing-period")?.addEventListener("change",loadCostingWorkbench);$c("costing-ai-refresh")?.addEventListener("click",()=>loadCostingAI(true))});
})();