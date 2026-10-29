// Maintained purchase-page source. Prices are returned by Xboard in minor units.
export const periods = [
  ['three_year_price', '三年', 36], ['two_year_price', '两年', 24],
  ['year_price', '一年', 12], ['half_year_price', '半年', 6],
  ['quarter_price', '三个月', 3], ['month_price', '一个月', 1],
  ['onetime_price', '一次性', null],
];

export function planOptions(plan) {
  return periods.flatMap(([key, label, months]) => {
    const raw = plan[key];
    if (raw === null || raw === undefined || !['number', 'string'].includes(typeof raw) || String(raw).trim() === '' || !Number.isFinite(Number(raw)) || Number(raw) < 0) return [];
    const cents = Math.round(Number(raw));
    const baseline = months && plan.month_price !== null && plan.month_price !== undefined
      && Number.isFinite(Number(plan.month_price)) && Number(plan.month_price) > 0
      ? Math.round(Number(plan.month_price)) * months : 0;
    const saving = Math.max(0, baseline - cents);
    return [{ key, label, months, cents, monthlyCents: months ? cents / months : null,
      saving, savingPercent: baseline ? Math.floor(saving * 100 / baseline) : 0 }];
  });
}

export function money(cents, minimumFractionDigits = 0) {
  return (Number(cents) / 100).toLocaleString('zh-CN', { maximumFractionDigits: 2, minimumFractionDigits });
}

export function planFeatures(plan) {
  try {
    const content = typeof plan.content === 'string' ? JSON.parse(plan.content) : plan.content;
    if (Array.isArray(content)) return content.filter(item => item && typeof item.feature === 'string')
      .map(item => ({ text: item.feature, supported: item.support !== false && item.support !== 0 }));
  } catch { /* HTML and Markdown descriptions are displayed as safe plain text. */ }
  const text = String(plan.content || '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/(?:li|p|div)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const lines = text.split('\n').map(line => line.replace(/^\s*[-*#•]+\s*/, '').trim()).filter(Boolean);
  if (lines.length) return lines.map(line => ({ text: line, supported: true }));
  const fallback = [];
  if (Number(plan.transfer_enable) > 0) fallback.push(`${plan.transfer_enable} GB 套餐流量`);
  if (Number(plan.speed_limit) > 0) fallback.push(`${plan.speed_limit} Mbps 速度上限`);
  if (Number(plan.device_limit) > 0) fallback.push(`${plan.device_limit} 台设备同时在线`);
  return fallback.map(text => ({ text, supported: true }));
}


export function planPresentation(plan) {
  const tier = String(plan.name || '').match(/^V([1-4])(?:\D|$)/i)?.[1];
  const subtitles = {
    1: '入门体验·支持AI·轻量使用。',
    2: '多场景稳定·减少AI风控降智·1080P',
    3: 'AI工作主力·进一步减少风控降智·4K',
    4: '独享·原生IP·双ISP·家宽·可定制',
  };
  return { subtitle: subtitles[tier] || '', recommended: tier === '3' };
}
export function displayFeatures(plan) {
  return planFeatures(plan).map(feature => ({ ...feature, text: feature.text
    .replace(/^速度[：:]\s*([\d.]+)\s*Mbps/i, '$1M 连接速度')
    .replace(/^流量[：:]\s*/, '').replace(/^设备[：:]\s*支持\s*(\d+)\s*个?设备在线/, '$1台设备同时在线')
    .replace(/^(IP人数|线路质量|IP质量|调度)[：:]\s*/i, '')
  })).sort((a, b) => Number(/人共享|独占资源|独享/.test(b.text)) - Number(/人共享|独占资源|独享/.test(a.text)));
}

export function selectionFor(plan, key) {
  const option = planOptions(plan).find(item => item.key === key);
  return option ? { plan, option } : null;
}

export function couponDiscount(cents, coupon) {
  if (!coupon) return 0;
  const value = Number(coupon.value);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(cents, Math.max(0, Number(coupon.type) === 1 ? Math.floor(value) : Number(coupon.type) === 2 ? Math.floor(cents * value / 100) : 0));
}
export function paymentFee(cents, method) {
  if (!(cents > 0) || !method) return 0;
  return Math.max(0, Math.round(cents * (Number(method.handling_fee_percent) || 0) / 100 + (Number(method.handling_fee_fixed) || 0)));
}
export function paymentTarget(value, origin) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try { const url = new URL(value, origin); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}

export function createPlansPage({ h, ref, onMounted, onUnmounted, Layout, QRCode, Modal, api, getConfig, getUser, refreshUser, confirm, openPayment, navigate }) {
  return {
    name: '126PlanCatalog',
    setup() {
      const plans = ref([]), methods = ref([]), methodId = ref(null), selected = ref(null);
      const loading = ref(true), error = ref(''), busy = ref(false), displayPeriod = ref('year_price');
      const couponInput = ref(''), coupon = ref(null), couponBusy = ref(false), couponError = ref('');
      const paymentError = ref(''), pending = ref(null), order = ref(null), qrValue = ref(''), completed = ref(false);
      let timer;
      const symbol = () => getConfig().currency_symbol || '¥';
      const price = (cents, full = false) => `${symbol()}${money(cents, full ? 2 : 0)}`;
      const chosenMethod = () => methods.value.find(item => String(item.id) === String(methodId.value));
      const selectionKey = () => selected.value ? `${selected.value.plan.id}:${selected.value.option.key}:${couponInput.value.trim()}` : '';
      const hasOrder = () => Boolean(order.value?.trade_no);
      const stopPolling = () => { if (timer) clearInterval(timer); timer = undefined; };
      onUnmounted(stopPolling);
      const estimate = () => {
        if (!selected.value) return { base: 0, discount: 0, balance: 0, payable: 0 };
        const base = selected.value.option.cents;
        const user = getUser() || {};
        const vip = Math.floor(base * Math.max(0, Math.min(100, Number(user.discount) || 0)) / 100);
        const discount = Math.min(base, couponDiscount(base, coupon.value) + vip);
        const balance = Math.min(base - discount, Math.max(0, Number(user.balance) || 0));
        return { base, discount, balance, payable: Math.max(0, base - discount - balance) };
      };
      const payable = () => hasOrder() && Number.isFinite(Number(order.value.total_amount))
        ? Math.max(0, Number(order.value.total_amount)) : estimate().payable;
      const total = () => payable() + paymentFee(payable(), chosenMethod());
      const load = async () => {
        loading.value = true; error.value = '';
        try {
          const [planResponse, methodResponse, orderResponse] = await Promise.all([
            api.get('/user/plan/fetch'), api.get('/user/order/getPaymentMethod'), api.get('/user/order/fetch'),
          ]);
          if (!Array.isArray(planResponse.data) || !Array.isArray(methodResponse.data) || !Array.isArray(orderResponse.data)) throw new Error('购买信息暂时不可用，请重试。');
          plans.value = planResponse.data.filter(plan => planOptions(plan).length);
          methods.value = methodResponse.data;
          methodId.value = methods.value[0]?.id ?? null;
          pending.value = orderResponse.data.find(item => [0, 1].includes(Number(item.status))) || null;
          if (!selected.value) {
            const preferred = plans.value.find(plan => planPresentation(plan).recommended && selectionFor(plan, 'year_price'));
            if (preferred) selected.value = selectionFor(preferred, 'year_price');
          }
        } catch (failure) { error.value = failure.message || '加载失败，请检查网络后重试。'; }
        finally { loading.value = false; }
      };
      onMounted(load);
      const clearCoupon = () => { coupon.value = null; couponError.value = ''; };
      const choose = (plan, key) => {
        if (busy.value || hasOrder() || completed.value) return;
        selected.value = selectionFor(plan, key); displayPeriod.value = key; clearCoupon(); paymentError.value = '';
      };
      const validateCoupon = async () => {
        if (!selected.value || !couponInput.value.trim() || hasOrder()) return false;
        const key = selectionKey(); couponBusy.value = true; couponError.value = ''; coupon.value = null;
        try {
          const response = await api.post('/user/coupon/check', { code: couponInput.value.trim(), plan_id: selected.value.plan.id, period: selected.value.option.key });
          if (key !== selectionKey()) return false;
          if (!response.data || ![1, 2].includes(Number(response.data.type))) throw new Error('此优惠券暂不可用。');
          coupon.value = { ...response.data, code: couponInput.value.trim() };
          return true;
        } catch (failure) { if (key === selectionKey()) couponError.value = failure.message || '优惠券校验失败'; return false; }
        finally { couponBusy.value = false; }
      };
      const settle = () => { completed.value = true; qrValue.value = ''; stopPolling(); pending.value = null; if (refreshUser) Promise.resolve(refreshUser()).catch(() => {}); };
      const checkPayment = async () => {
        if (!hasOrder()) return;
        try {
          const tradeNo = order.value.trade_no;
          const response = await api.get(`/user/order/check?trade_no=${encodeURIComponent(tradeNo)}`);
          if (order.value?.trade_no !== tradeNo) return;
          const status = Number(response.data);
          if ([1, 3, 4].includes(status)) settle();
          if (status === 2) { stopPolling(); qrValue.value = ''; order.value = null; selected.value = null; paymentError.value = '订单已取消，请重新选择套餐。'; }
        } catch (failure) { paymentError.value = failure.message || '暂未获取到支付结果，可稍后再次检查。'; }
      };
      const resumeOrder = async () => {
        if (!pending.value || Number(pending.value.status) !== 0 || busy.value) return;
        busy.value = true; paymentError.value = '';
        try {
          const response = await api.get(`/user/order/detail?trade_no=${encodeURIComponent(pending.value.trade_no)}`);
          if (!response.data) throw new Error('无法读取待支付订单。');
          order.value = response.data;
          if ([1, 3, 4].includes(Number(order.value.status))) { settle(); return; }
          if (Number(order.value.status) !== 0) throw new Error('该订单当前不可支付，请刷新页面。');
          const plan = order.value.plan;
          const option = planOptions(plan).find(item => item.key === order.value.period)
            || { key: order.value.period, label: periods.find(item => item[0] === order.value.period)?.[1] || '原订单周期', cents: Number(order.value.total_amount), months: null, saving: 0 };
          selected.value = { plan, option }; displayPeriod.value = option.key;
          clearCoupon(); couponInput.value = '';
        } catch (failure) { paymentError.value = failure.message; }
        finally { busy.value = false; }
      };
      const cancelCurrent = async () => {
        const current = order.value || pending.value;
        if (!current || busy.value || !await confirm('如果已经付款，请等待支付结果。确定取消这笔待支付订单，并重新选择套餐吗？')) return;
        busy.value = true; paymentError.value = '';
        try {
          const response = await api.post('/user/order/cancel', { trade_no: current.trade_no });
          if (response.data !== true) throw new Error('订单尚未取消，请刷新后重试。');
          stopPolling(); order.value = null; pending.value = null; qrValue.value = ''; selected.value = null; clearCoupon();
        } catch (failure) { paymentError.value = failure.message; }
        finally { busy.value = false; }
      };
      const pay = async () => {
        if (completed.value) { navigate('/dashboard'); return; }
        if (!selected.value || busy.value || couponBusy.value) return;
        busy.value = true; paymentError.value = '';
        try {
          if (!hasOrder()) {
            if (couponInput.value.trim() && coupon.value?.code !== couponInput.value.trim() && !await validateCoupon()) return;
            const currentOrders = await api.get('/user/order/fetch');
            if (!Array.isArray(currentOrders.data)) throw new Error('无法核对订单状态，请重试。');
            const existing = currentOrders.data.find(item => [0, 1].includes(Number(item.status)));
            if (existing) { pending.value = existing; throw new Error(Number(existing.status) === 1 ? '已有订单正在处理，请等待开通。' : '你有待支付订单，请先在本页继续付款或取消该订单。'); }
            const user = getUser() || {};
            if (user.plan_id && String(user.plan_id) !== String(selected.value.plan.id) && (!user.expired_at || Number(user.expired_at) >= Date.now() / 1000)
              && !await confirm('你正在变更现有订阅。完成付款后，当前订阅将被新套餐覆盖；折抵与应付金额由服务器计算。确认继续吗？')) return;
            const response = await api.post('/user/order/save', { plan_id: selected.value.plan.id, period: selected.value.option.key, coupon_code: coupon.value?.code || undefined });
            if (typeof response.data !== 'string' || !response.data) throw new Error('未获得订单号，请刷新订单状态后重试。');
            // Preserve the order ID immediately: detail or gateway errors must not create another order.
            order.value = { trade_no: response.data, status: 0 };
          }
          const previouslyShown = total();
          const response = await api.get(`/user/order/detail?trade_no=${encodeURIComponent(order.value.trade_no)}`);
          if (!response.data || response.data.total_amount === null || response.data.total_amount === undefined || !Number.isFinite(Number(response.data.total_amount)) || Number(response.data.total_amount) < 0) throw new Error('订单已创建，暂时无法核对金额。请在本页再次点击付款。');
          order.value = response.data;
          if ([1, 3, 4].includes(Number(order.value.status))) { settle(); return; }
          if (Number(order.value.status) !== 0) throw new Error('订单当前不可支付，请刷新订单状态。');
          if (total() > previouslyShown) { paymentError.value = '服务器已更新应付金额，请核对下方金额后再次点击立即付款。'; return; }
          if (payable() > 0 && !chosenMethod()) throw new Error('请选择可用的支付方式。');
          const payment = await api.post('/user/order/checkout', { trade_no: order.value.trade_no, method: chosenMethod()?.id });
          if (payment.data === true) { settle(); return; }
          if (Number(payment.type) === 1) {
            const target = paymentTarget(payment.data, location.origin);
            if (!target) throw new Error('支付入口地址无效，请更换支付方式后重试。');
            openPayment(target);
          } else if (Number(payment.type) === 0 && typeof payment.data === 'string' && payment.data) {
            qrValue.value = payment.data;
            stopPolling(); timer = setInterval(checkPayment, 5000);
          } else throw new Error('未获得有效的付款入口，请重试或联系在线客服。');
        } catch (failure) { paymentError.value = failure.message || '付款发起失败，请重试。'; }
        finally { busy.value = false; }
      };
      const renderCard = plan => {
        const options = planOptions(plan);
        if (!options.length) return null;
        const active = selected.value && String(selected.value.plan.id) === String(plan.id);
        const preferred = options.find(option => option.key === displayPeriod.value);
        const presentation = planPresentation(plan);
        return h('article', { class: ['purchase-card', active && 'is-selected'], key: plan.id }, [
          h('button', { type: 'button', class: 'purchase-card-title', 'aria-label': `选择${plan.name}`, 'aria-pressed': Boolean(active), disabled: !preferred || busy.value || hasOrder() || completed.value, onClick: () => choose(plan, preferred.key) }, [h('span', { class: ['purchase-card-radio', active && 'is-checked'], 'aria-hidden': 'true' }, active ? '✓' : ''), h('h2', {}, String(plan.name || '订阅套餐')), presentation.recommended ? h('span', { class: 'purchase-recommended' }, '推荐') : null]),
          h('p', { class: 'purchase-card-subtitle' }, presentation.subtitle),
          h('div', { class: 'purchase-price' }, preferred ? [h('span', { class: 'purchase-currency' }, symbol()), h('strong', {}, money(preferred.monthlyCents ?? preferred.cents)), h('span', {}, preferred.months ? '元/月' : '元/次')] : [h('span', { class: 'purchase-unavailable' }, '暂不提供此周期')]),
          !preferred ? h('p', { class: 'purchase-price-caption' }, '可选择下方其他购买周期') : null,
          h('ul', { class: 'purchase-features' }, displayFeatures(plan).map(feature => h('li', { class: !feature.supported && 'is-unsupported' }, [h('span', { class: 'purchase-check', 'aria-hidden': 'true' }, feature.supported ? '✓' : '−'), h('span', {}, feature.text)]))),
          h('div', { class: 'purchase-periods', role: 'group', 'aria-label': `${plan.name} 购买周期` }, options.map(option => {
            const checked = active && option.key === selected.value.option.key;
            return h('button', { type: 'button', class: ['purchase-period', checked && 'is-selected'], disabled: busy.value || hasOrder() || completed.value,
              'aria-pressed': Boolean(checked), onClick: () => choose(plan, option.key) }, [
              h('span', { class: 'purchase-period-main' }, [h('span', { class: 'purchase-period-label' }, [h('strong', {}, option.label), option.savingPercent > 0 ? h('em', {}, `省 ${option.savingPercent}%`) : null]), h('small', {}, `合计 ${price(option.cents)}`)]),
              h('span', { class: 'purchase-period-price' }, [h('strong', {}, price(option.monthlyCents ?? option.cents)), h('small', {}, option.months ? '/月' : '/次')]),
            ]);
          })),
        ]);
      };
      return () => h(Layout, { 'show-footer': false }, { default: () => [h('section', { class: 'purchase-page', 'aria-labelledby': 'purchase-title' }, [
        h('header', { class: 'purchase-heading' }, [h('h1', { id: 'purchase-title' }, '你的购买，将帮助一名贫困学生重返校园')]),
        pending.value && !hasOrder() ? h('div', { class: 'purchase-alert' }, [h('p', {}, Number(pending.value.status) === 1 ? '已有订单正在处理，请等待开通。' : `你有待支付订单：${pending.value.plan?.name || pending.value.trade_no}`), Number(pending.value.status) === 0 ? h('div', {}, [h('button', { type: 'button', disabled: busy.value, onClick: resumeOrder }, '继续支付此订单'), h('button', { type: 'button', disabled: busy.value, onClick: cancelCurrent }, '取消此订单')]) : null]) : null,
        loading.value ? h('div', { class: 'purchase-state', role: 'status' }, '正在加载套餐…') : error.value ? h('div', { class: 'purchase-state', role: 'alert' }, [h('p', {}, error.value), h('button', { type: 'button', onClick: load }, '重新加载')]) : h('div', { class: 'purchase-grid' }, plans.value.map(renderCard).filter(Boolean)),
        !loading.value && !error.value && !plans.value.length ? h('div', { class: 'purchase-state' }, '暂无可购买套餐，请稍后再来。') : null,
        !loading.value && !error.value ? h('div', { class: 'purchase-settings' }, [
          h('section', { class: 'purchase-method-panel', 'aria-labelledby': 'purchase-method-title' }, [h('h2', { id: 'purchase-method-title' }, '选择支付方式'), h('div', { class: 'purchase-methods', role: 'group', 'aria-label': '支付方式' }, methods.value.map(method => h('button', { type: 'button', disabled: busy.value || completed.value, 'aria-pressed': String(methodId.value) === String(method.id), class: ['purchase-method', String(methodId.value) === String(method.id) && 'is-selected'], onClick: () => { methodId.value = method.id; paymentError.value = ''; } }, [h('span', { class: 'purchase-method-icon' }, String(method.name || '支付').includes('微信') ? '微' : '支'), h('span', {}, [h('strong', {}, method.name), h('small', {}, Number(method.handling_fee_fixed) || Number(method.handling_fee_percent) ? `手续费：${price(Number(method.handling_fee_fixed) || 0)} + ${Number(method.handling_fee_percent) || 0}%` : '无需支付手续费')]), h('span', { class: 'purchase-method-check', 'aria-hidden': 'true' }, String(methodId.value) === String(method.id) ? '✓' : '○')]))), !methods.value.length ? h('p', {}, '暂无在线支付方式；若优惠或余额全额抵扣，可直接完成订单。') : null]),
          h('section', { class: 'purchase-coupon-panel', 'aria-labelledby': 'purchase-coupon-title' }, [h('h2', { id: 'purchase-coupon-title' }, '优惠抵扣'), h('p', {}, hasOrder() ? '订单已创建，金额以服务器核算结果为准。' : '输入优惠券，账户余额将在下单时自动抵扣。'), h('div', { class: 'purchase-coupon-input' }, [h('input', { 'aria-label': '优惠券代码', placeholder: '输入优惠券代码', value: couponInput.value, disabled: busy.value || hasOrder() || completed.value, onInput: event => { couponInput.value = event.target.value; clearCoupon(); } }), h('button', { type: 'button', disabled: !selected.value || !couponInput.value.trim() || couponBusy.value || busy.value || hasOrder(), onClick: validateCoupon }, couponBusy.value ? '校验中…' : '使用优惠券')]), coupon.value ? h('p', { class: 'purchase-coupon-success', role: 'status' }, `${coupon.value.name || '优惠券'} 已生效，预计减免 ${price(couponDiscount(selected.value?.option.cents || 0, coupon.value))}`) : null, couponError.value ? h('p', { class: 'purchase-inline-error', role: 'alert' }, couponError.value) : null]),
        ]) : null,
        selected.value ? h('div', { class: 'purchase-breakdown', 'aria-label': '金额明细' }, [(hasOrder() ? Number(order.value.discount_amount) : estimate().discount) > 0 ? h('span', {}, `优惠抵扣 −${price(hasOrder() ? order.value.discount_amount : estimate().discount)}`) : null, (hasOrder() ? Number(order.value.balance_amount) : estimate().balance) > 0 ? h('span', {}, `余额抵扣 −${price(hasOrder() ? order.value.balance_amount : estimate().balance)}`) : null, Number(order.value?.surplus_amount) > 0 ? h('span', {}, `旧订阅折抵 −${price(order.value.surplus_amount)}`) : null, paymentFee(payable(), chosenMethod()) > 0 ? h('span', {}, `手续费 +${price(paymentFee(payable(), chosenMethod()))}`) : null, hasOrder() ? h('small', {}, `订单号：${order.value.trade_no}`) : null]) : null,
        paymentError.value ? h('div', { class: 'purchase-inline-error purchase-payment-error', role: 'alert' }, paymentError.value) : null,
        hasOrder() && !completed.value ? h('div', { class: 'purchase-order-lock' }, [h('span', {}, '已创建待支付订单；如需修改套餐或优惠券，请先取消。'), h('button', { type: 'button', disabled: busy.value, onClick: cancelCurrent }, '取消订单并重新选择')]) : null,
        completed.value ? h('div', { class: 'purchase-success', role: 'status' }, '付款成功，订阅正在开通。你可以返回用户中心查看最新状态。') : null,
        h('div', { class: 'purchase-checkout', 'aria-label': '当前订单汇总' }, [h('div', { class: 'purchase-summary', 'aria-live': 'polite' }, selected.value ? [h('small', {}, completed.value ? '支付成功' : '当前选择'), h('strong', {}, `${selected.value.plan.name} · ${selected.value.option.label}方案`), selected.value.option.saving > 0 ? h('span', { class: 'purchase-saving' }, `较月付累计节省 ${price(selected.value.option.saving)}`) : null] : [h('small', {}, '开始你的订阅'), h('strong', {}, '请选择套餐和购买周期')]), h('div', { class: 'purchase-checkout-action' }, [h('div', { class: 'purchase-total' }, [h('small', {}, hasOrder() ? '应付金额' : '预计应付'), h('strong', {}, selected.value ? price(total(), true) : '—')]), h('button', { type: 'button', disabled: !selected.value || busy.value || couponBusy.value || loading.value || Boolean(error.value) || (!chosenMethod() && payable() > 0), onClick: pay }, [completed.value ? '查看我的订阅' : busy.value ? '正在发起付款…' : '立即付款', h('span', { 'aria-hidden': 'true' }, '→')])])]),
        qrValue.value ? h(Modal, { show: true, 'onUpdate:show': value => { if (!value) { qrValue.value = ''; stopPolling(); } } }, { default: () => h('section', { class: 'purchase-qr', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'purchase-qr-title' }, [h('h2', { id: 'purchase-qr-title' }, '扫码付款'), h('p', {}, `${chosenMethod()?.name || ''} · ${price(total())}`), h(QRCode, { value: qrValue.value, size: 240 }), h('p', {}, '付款完成后会自动更新状态。'), h('button', { type: 'button', onClick: checkPayment }, '检查支付结果'), h('button', { type: 'button', onClick: () => { qrValue.value = ''; stopPolling(); } }, '关闭二维码')]) }) : null,
      ])] });
    },
  };
}
