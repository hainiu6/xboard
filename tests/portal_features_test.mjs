import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
const moduleFrom = async name => import(`data:text/javascript;base64,${Buffer.from(await readFile(new URL(`../public/assets/126/${name}.js`,import.meta.url),'utf8')).toString('base64')}`);
const { noticePage, createNotice } = await moduleFrom('notices');
const { noticePageField } = await moduleFrom('admin-notice');
// Rewrite only the relative import when testing the maintained module from a data URL.
const ordersSource=(await readFile(new URL('../public/assets/126/orders.js',import.meta.url),'utf8')).replace("'./plan-catalog.js'", JSON.stringify(`data:text/javascript;base64,${Buffer.from(await readFile(new URL('../public/assets/126/plan-catalog.js',import.meta.url),'utf8')).toString('base64')}`));
const { createOrdersPage, filterOrders, orderStatus, orderPeriod }=await import(`data:text/javascript;base64,${Buffer.from(ordersSource).toString('base64')}`);
assert.equal(noticePage('/order/owned-trade'), 'order');
assert.equal(noticePage('/node'), null);
assert.equal(noticePage('/login'), null);
const node=(type,props={},children=[])=>({type,props,children});
const walk=item=>Array.isArray(item)?item.flatMap(walk):item&&typeof item==='object'?[item,...(Array.isArray(item.children)?item.children.flatMap(walk):[])]:[];
const has=(item,value)=>Array.isArray(item.props?.class)?item.props.class.includes(value):item.props?.class===value;
const fixtures=[
 {trade_no:'pending',plan:{name:'V3极速套餐'},period:'year_price',status:0,total_amount:42000,created_at:1793270000},
 {trade_no:'cancelled',plan:{name:'V1基础套餐'},period:'month_price',status:2,total_amount:2500,created_at:1793200000},
 {trade_no:'paid',plan:{name:'V2高速套餐'},period:'quarter_price',status:3,total_amount:13800,created_at:1793100000},
];
assert.equal(filterOrders(fixtures,'pending','').length,1);
assert.equal(filterOrders(fixtures,'all','V3')[0].trade_no,'pending');
assert.equal(filterOrders(fixtures,'paid','').length,1);
assert.equal(orderStatus(2)[0],'已取消');assert.equal(orderPeriod('year_price'),'一年');
async function ordersHarness(confirm=true) {
 let mounted;let items=structuredClone(fixtures);const calls=[],navigations=[];
 const component=createOrdersPage({h:node,ref:value=>({value}),onMounted:fn=>mounted=fn,Layout:'layout',getConfig:()=>({currency_symbol:'¥'}),navigate:target=>navigations.push(target),confirm:async()=>confirm,api:{get:async url=>{calls.push(['GET',url]);return {data:items};},post:async(url,data)=>{calls.push(['POST',url,data]);items=items.map(item=>item.trade_no===data.trade_no?{...item,status:2}:item);return {data:true};}}});
 const render=component.setup();await mounted();const nodes=()=>walk(render().children.default()[0]);return {nodes,calls,navigations};
}
let harness=await ordersHarness();
const cancelled=harness.nodes().find(item=>has(item,'orders-row')&&item.props.key==='cancelled');
assert.equal(walk(cancelled).filter(item=>has(item,'orders-cancel')).length,0);
harness.nodes().find(item=>has(item,'orders-pay')).props.onClick();assert.deepEqual(harness.navigations,['/plan?trade_no=pending']);
await harness.nodes().find(item=>has(item,'orders-cancel')).props.onClick();assert.equal(harness.calls.filter(item=>item[0]==='POST').length,1);
assert.equal(harness.nodes().filter(item=>has(item,'orders-pay')).length,0);
harness=await ordersHarness(false);await harness.nodes().find(item=>has(item,'orders-cancel')).props.onClick();assert.equal(harness.calls.filter(item=>item[0]==='POST').length,0);
// The page selector uses controlled values: legacy null, explicit empty and multiple pages.
const jsx={jsx:(type,props,key)=>({...node(type,props,props.children),key}),jsxs:(type,props,key)=>({...node(type,props,props.children),key})};
let changed;let field=noticePageField(jsx,{value:null,onChange:value=>changed=value});
assert.equal(walk(field).filter(item=>item.type==='input'&&item.props.checked).length,1);
field=noticePageField(jsx,{value:[],onChange:value=>changed=value});assert.equal(walk(field).filter(item=>item.type==='input'&&item.props.checked).length,0);
walk(field).find(item=>item.type==='input').props.onChange({target:{checked:true}});assert.deepEqual(changed,['dashboard']);
let mounted,unmount;const calls=[];
const notice=createNotice({h:node,ref:value=>({value}),onMounted:fn=>mounted=fn,onUnmounted:fn=>unmount=fn,api:{get:async url=>{calls.push(url);return {data:[]};}},getPath:()=>'/plan',renderMarkdown:text=>text});
const render=notice.setup();await mounted();assert.deepEqual(calls,['/user/notice/fetch?page=plan']);assert.equal(render(),null);unmount();
// Exercise the actual shipped storage and login function with a controllable clock.
const bundle=await readFile(new URL('../theme/Xboard/assets/umi.js',import.meta.url),'utf8');
const storageClass=bundle.slice(bundle.indexOf('class id{'),bundle.indexOf('function ad('));
const loginFunction=bundle.match(/function PN\(e\)\{[^}]+\}/)[0];
let now=Date.now();const values=new Map();
const context={f:(object,key,value)=>Object.defineProperty(object,key,{value,writable:true}),Date:class extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}},storage:{setItem:(key,value)=>values.set(key,value),getItem:key=>values.get(key),removeItem:key=>values.delete(key),clear:()=>values.clear()}};
runInNewContext(`${storageClass};const sd=new id({prefixKey:'Vue_Naive_',storage});${loginFunction};PN('test-only');globalThis.readToken=()=>sd.get('access_token').value;globalThis.logout=()=>sd.remove('access_token');globalThis.login=()=>PN('test-only');`,context);
now+=7*3600*1000;assert.equal(context.readToken(),'test-only');now+=363*86400*1000;assert.equal(context.readToken(),'test-only');context.logout();assert.equal(context.readToken(),null);context.login();now+=366*86400*1000;assert.equal(context.readToken(),null);
console.log('Order filtering/actions, notice page selection and one-year login persistence passed.');
