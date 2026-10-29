import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const source = await readFile(new URL('../public/assets/126/plan-catalog.js', import.meta.url), 'utf8');
const { planOptions, money, planFeatures, selectionFor, createPlansPage, displayFeatures, couponDiscount, paymentFee, paymentTarget } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const plan = { id: 7, name: '测试套餐', month_price: 2500, quarter_price: 6000, year_price: 18000, two_year_price: 24000, reset_price: 1200, onetime_price: null };
const annual = planOptions(plan).find(item => item.key === 'year_price');
assert.equal(annual.cents, 18000);
assert.equal(annual.monthlyCents, 1500);
assert.equal(annual.saving, 12000);
assert.equal(annual.savingPercent, 40);
assert.equal(planOptions(plan)[0].key, 'two_year_price');
assert.ok(!planOptions(plan).some(item => item.key === 'reset_price'));
assert.equal(planOptions({ month_price: 0 })[0].cents, 0);
assert.equal(planOptions({ month_price: null, year_price: '' }).length, 0);
assert.equal(planOptions({ month_price: -1, year_price: 'invalid' }).length, 0);
assert.equal(planOptions({ month_price: 1998.999999999 })[0].cents, 1999);
assert.equal(planOptions({ onetime_price: 9000 })[0].monthlyCents, null);
assert.equal(planOptions({ month_price: null, year_price: 9000 })[0].saving, 0);
assert.equal(planOptions({ month_price: 1000, year_price: 15000 }).find(item => item.months === 12).saving, 0);
assert.equal(money(1999), '19.99');
assert.equal(money(0), '0');
assert.equal(selectionFor(plan, 'reset_price'), null);
assert.equal(selectionFor(plan, 'year_price').option.cents, 18000);
assert.deepEqual(planFeatures({ content: '[{"feature":"50G 流量","support":true},{"feature":"独享 IP","support":false}]' }), [{ text: '50G 流量', supported: true }, { text: '独享 IP', supported: false }]);
assert.deepEqual(planFeatures({ content: '<script>alert(1)</script><p>线路说明</p><p>设备支持</p>' }), [{ text: '线路说明', supported: true }, { text: '设备支持', supported: true }]);

assert.equal(planOptions({month_price:false}).length, 0);
assert.equal(couponDiscount(10000, {type:1,value:1500}),1500);
assert.equal(couponDiscount(10000, {type:2,value:20}),2000);
assert.equal(couponDiscount(1000, {type:1,value:5000}),1000);
assert.equal(paymentFee(10000,{handling_fee_percent:2.5,handling_fee_fixed:50}),300);
assert.equal(paymentFee(0,{handling_fee_fixed:50}),0);
assert.equal(paymentTarget('javascript:alert(1)','https://panel.test'),null);
assert.equal(paymentTarget('https://cashier.test/pay','https://panel.test'),'https://cashier.test/pay');

const node = (type, props = {}, children = []) => ({ type, props, children });
const walk = item => item && typeof item === 'object' ? [item, ...(Array.isArray(item.children) ? item.children.flatMap(walk) : [])] : [];
globalThis.location = {origin:'https://panel.test'};
async function harness(overrides = {}) {
  let mounted;
  const cleanups=[], calls=[], redirects=[], navigations=[];
  const state={total:18000,status:0,orders:[],methods:[{id:1,name:'支付宝',handling_fee_fixed:0,handling_fee_percent:0}],user:{},...overrides};
  const api={
    async get(url) {
      calls.push(['GET',url]);
      if(url==='/user/plan/fetch')return {data:state.plans||[plan]};
      if(url==='/user/order/getPaymentMethod')return {data:state.methods};
      if(url==='/user/order/fetch')return {data:state.orders};
      if(url.startsWith('/user/order/detail')) {
        if(state.detailError)throw new Error('网络暂不可用');
        return {data:{trade_no:'test-order',total_amount:state.total,status:state.status,plan,period:'year_price',plan_id:plan.id}};
      }
      if(url.startsWith('/user/order/check'))return {data:state.status};
      throw new Error(url);
    },
    async post(url,data) {
      calls.push(['POST',url,data]);
      if(url==='/user/coupon/check') {
        if(state.couponError)throw new Error('此优惠券不适用当前周期');
        return {data:{type:2,value:10,name:'测试优惠券'}};
      }
      if(url==='/user/order/save') {
        if(state.saveError){state.orders=[{trade_no:'test-order',plan,period:'year_price',status:0}];throw new Error('订单响应超时');}
        return {data:'test-order'};
      }
      if(url==='/user/order/checkout') {
        if(state.checkoutError)throw new Error('付款入口暂不可用');
        return state.payment||{type:1,data:'https://cashier.test/pay'};
      }
      if(url==='/user/order/cancel'){state.orders=[];return {data:true};}
      throw new Error(url);
    }
  };
  const page=createPlansPage({h:node,ref:value=>({value}),onMounted:callback=>{mounted=callback;},onUnmounted:callback=>cleanups.push(callback),Layout:'layout',QRCode:'qr',Modal:'modal',api,getConfig:()=>({currency_symbol:'¥'}),getUser:()=>state.user,confirm:async()=>state.confirm!==false,openPayment:url=>redirects.push(url),navigate:url=>navigations.push(url),getRequestedOrder:()=>state.requestedOrder});
  const render=page.setup(); await mounted();
  const nodes=()=>walk(render().children.default()[0]);
  const payButton=()=>nodes().find(item=>item.props.class==='purchase-checkout-action').children.find(item=>item.type==='button');
  const choose=()=>nodes().find(item=>item.type==='button'&&item.children?.some?.(child=>child?.props?.class==='purchase-period-main'&&JSON.stringify(child).includes('一年'))).props.onClick();
  const couponInput=value=>nodes().find(item=>item.type==='input'&&item.props['aria-label']==='优惠券代码').props.onInput({target:{value}});
  const validateCoupon=()=>nodes().find(item=>item.type==='button'&&item.children==='使用优惠券').props.onClick();
  return {state,calls,redirects,navigations,nodes,payButton,choose,couponInput,validateCoupon,dispose:()=>cleanups.forEach(callback=>callback())};
}
const count=(h,url)=>h.calls.filter(call=>call[0]==='POST'&&call[1]===url).length;
const run=async(name,test)=>{await test();console.log('✓ '+name);};
await run('Direct checkout stays on the catalog until a server gateway URL is returned',async()=>{
 const h=await harness();assert.equal(h.payButton().props.disabled,true);h.choose();await h.payButton().props.onClick();
 assert.equal(count(h,'/user/order/save'),1);assert.equal(count(h,'/user/order/checkout'),1);
 assert.deepEqual(h.redirects,['https://cashier.test/pay']);assert.deepEqual(h.navigations,[]);
 assert.equal(h.calls.find(call=>call[1]==='/user/order/save')[2].period,'year_price');h.dispose();
});
await run('Double clicks do not create duplicate orders',async()=>{
 const h=await harness();h.choose();await Promise.all([h.payButton().props.onClick(),h.payButton().props.onClick()]);assert.equal(count(h,'/user/order/save'),1);assert.equal(count(h,'/user/order/checkout'),1);h.dispose();
});
await run('Coupon validation sends both plan and period and is used for payment',async()=>{
 const h=await harness({total:16200});h.choose();h.couponInput('SAVE10');await h.validateCoupon();
 const checked=h.calls.find(call=>call[1]==='/user/coupon/check')[2];assert.deepEqual(checked,{code:'SAVE10',plan_id:7,period:'year_price'});
 await h.payButton().props.onClick();assert.equal(h.calls.find(call=>call[1]==='/user/order/save')[2].coupon_code,'SAVE10');assert.equal(h.redirects.length,1);h.dispose();
});
await run('Invalid coupon prevents order creation',async()=>{
 const h=await harness({couponError:true});h.choose();h.couponInput('INVALID');await h.payButton().props.onClick();assert.equal(count(h,'/user/order/save'),0);assert.ok(JSON.stringify(h.nodes()).includes('不适用当前周期'));h.dispose();
});
await run('An increased server amount requires explicit reconfirmation on this page',async()=>{
 const h=await harness({total:19000});h.choose();await h.payButton().props.onClick();assert.equal(count(h,'/user/order/checkout'),0);assert.ok(JSON.stringify(h.nodes()).includes('服务器已更新应付金额'));
 await h.payButton().props.onClick();assert.equal(count(h,'/user/order/save'),1);assert.equal(count(h,'/user/order/checkout'),1);h.dispose();
});
await run('Gateway errors retry the existing order',async()=>{
 const h=await harness({checkoutError:true});h.choose();await h.payButton().props.onClick();h.state.checkoutError=false;await h.payButton().props.onClick();assert.equal(count(h,'/user/order/save'),1);assert.equal(h.redirects.length,1);h.dispose();
});
await run('A lost save response is recovered from pending orders without another save',async()=>{
 const h=await harness({saveError:true});h.choose();await h.payButton().props.onClick();await h.payButton().props.onClick();assert.equal(count(h,'/user/order/save'),1);
 await h.nodes().find(item=>item.type==='button'&&item.children==='继续支付此订单').props.onClick();await h.payButton().props.onClick();assert.equal(count(h,'/user/order/save'),1);assert.equal(h.redirects.length,1);h.dispose();
});
await run('Changing a current subscription requires confirmation before saving',async()=>{
 const h=await harness({user:{plan_id:8,expired_at:null},confirm:false});h.choose();await h.payButton().props.onClick();assert.equal(count(h,'/user/order/save'),0);h.dispose();
});
await run('An existing unpaid order is not silently replaced or cancelled',async()=>{
 const h=await harness({orders:[{trade_no:'old',plan,period:'year_price',status:0}]});h.choose();await h.payButton().props.onClick();assert.equal(count(h,'/user/order/save'),0);assert.equal(count(h,'/user/order/cancel'),0);h.dispose();
});
await run('Balance-covered orders complete without an external payment method',async()=>{
 const h=await harness({total:0,user:{balance:18000},methods:[],payment:{type:-1,data:true}});h.choose();assert.equal(h.payButton().props.disabled,false);await h.payButton().props.onClick();assert.ok(JSON.stringify(h.nodes()).includes('付款成功'));assert.equal(h.redirects.length,0);h.dispose();
});
await run('An invalid cashier URL is rejected',async()=>{
 const h=await harness({payment:{type:1,data:'javascript:alert(1)'}});h.choose();await h.payButton().props.onClick();assert.equal(h.redirects.length,0);assert.ok(JSON.stringify(h.nodes()).includes('地址无效'));h.dispose();
});
await run('QR checkout renders a modal on the catalog and stops polling on unmount',async()=>{
 const h=await harness({payment:{type:0,data:'weixin://preview-only'}});h.choose();await h.payButton().props.onClick();assert.ok(h.nodes().some(item=>item.type==='modal'));assert.deepEqual(h.navigations,[]);h.dispose();
});
const catalogPlans = [1, 2, 3, 4].map((tier) => ({ ...plan, id: tier, name: `V${tier}测试套餐`, year_price: tier * 12000, two_year_price: tier * 18000 }));
const hasClass = (item, value) => Array.isArray(item.props?.class) ? item.props.class.includes(value) : item.props?.class === value;
await run('V3 annual is selected by default using server plan IDs and prices', async () => {
 const h=await harness({plans:catalogPlans});
 const cards=h.nodes().filter(item=>hasClass(item,'purchase-card'));
 assert.equal(cards.filter(item=>hasClass(item,'is-selected')).length,1);
 assert.equal(cards.find(item=>hasClass(item,'is-selected')).props.key,3);
 assert.ok(JSON.stringify(h.nodes().find(item=>hasClass(item,'purchase-summary'))).includes('一年方案'));
 assert.equal(h.payButton().props.disabled,false); h.dispose();
});
await run('Switching the period synchronizes every card price and selecting another plan keeps that period', async () => {
 const h=await harness({plans:catalogPlans});
 const cards=()=>h.nodes().filter(item=>hasClass(item,'purchase-card'));
 const period=(card,label)=>walk(card).find(item=>item.type==='button' && item.children?.some?.(child=>child?.props?.class==='purchase-period-main'&&JSON.stringify(child).includes(label)));
 period(cards()[1],'两年').props.onClick();
 for (let i=0;i<4;i++) {
   const card=cards()[i];
   assert.equal(period(card,'两年').props['aria-pressed'],i===1);
   assert.equal(period(card,'一年').props['aria-pressed'],false);
   const price=walk(card).find(item=>hasClass(item,'purchase-price'));
   assert.ok(JSON.stringify(price).includes(money(catalogPlans[i].two_year_price/24)));
 }
 walk(cards()[3]).find(item=>item.type==='button' && hasClass(item,'purchase-card-title')).props.onClick();
 assert.ok(JSON.stringify(h.nodes().find(item=>hasClass(item,'purchase-summary'))).includes('V4测试套餐 · 两年方案'));
 assert.equal(h.nodes().filter(item=>hasClass(item,'purchase-period')&&item.props['aria-pressed']).length,1);
 h.dispose();
});
await run('A missing shared period is shown as unavailable rather than displaying another price', async () => {
 const h=await harness({plans:[catalogPlans[0], {...catalogPlans[2],two_year_price:null}]});
 const cards=()=>h.nodes().filter(item=>hasClass(item,'purchase-card'));
 walk(cards()[0]).find(item=>item.type==='button' && item.children?.some?.(child=>child?.props?.class==='purchase-period-main'&&JSON.stringify(child).includes('两年'))).props.onClick();
 assert.ok(JSON.stringify(cards()[1]).includes('暂不提供此周期'));
 assert.equal(walk(cards()[1]).find(item=>item.type==='button'&&hasClass(item,'purchase-card-title')).props.disabled,true);h.dispose();
});
await run('Cycle changes clear coupon eligibility and do not alter a created order', async () => {
 const h=await harness({plans:catalogPlans,total:36000});
 h.couponInput('SAVE10');await h.validateCoupon();
 const card=()=>h.nodes().find(item=>hasClass(item,'purchase-card')&&item.props.key===3);
 const period=()=>walk(card()).find(item=>item.type==='button'&&item.children?.some?.(child=>child?.props?.class==='purchase-period-main'&&JSON.stringify(child).includes('两年')));
 period().props.onClick();assert.ok(!JSON.stringify(h.nodes()).includes('已生效'));
 h.couponInput('');await h.payButton().props.onClick();
 assert.equal(h.calls.find(call=>call[1]==='/user/order/save')[2].period,'two_year_price');
 assert.equal(period().props.disabled,true);h.dispose();
});
assert.deepEqual(displayFeatures({content:'速度：10Mbps\n设备：支持 2 个设备在线\nIP人数：100人共享'}).map(item=>item.text),['100人共享','10M 连接速度','2台设备同时在线']);
await run('Order-history handoff resumes only a matching owned pending order without creating a new one',async()=>{
 const h=await harness({requestedOrder:'test-order',orders:[{trade_no:'test-order',plan,period:'year_price',status:0}]});
 assert.ok(JSON.stringify(h.nodes()).includes('已创建待支付订单'));
 await h.payButton().props.onClick();assert.equal(count(h,'/user/order/save'),0);assert.equal(count(h,'/user/order/checkout'),1);h.dispose();
 const other=await harness({requestedOrder:'someone-else',orders:[{trade_no:'test-order',plan,period:'year_price',status:0}]});
 assert.equal(other.calls.filter(call=>call[1].startsWith('/user/order/detail')).length,0);other.dispose();
});
const bundle=await readFile(new URL('../theme/Xboard/assets/umi.js',import.meta.url),'utf8');
assert.ok(bundle.includes('/*126_PLAN_CATALOG*/'));
execFileSync('python3',['scripts/build-user-theme.py'],{cwd:new URL('..',import.meta.url),stdio:'pipe'});
assert.equal(await readFile(new URL('../theme/Xboard/assets/umi.js',import.meta.url),'utf8'),bundle);
console.log('Plan pricing, coupons, direct payment, retries and reproducible bridge passed.');
