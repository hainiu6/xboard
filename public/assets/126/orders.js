import { money, periods } from './plan-catalog.js';

export function orderStatus(value) {
  return ({ 0: ['待支付', 'pending'], 1: ['开通中', 'processing'], 2: ['已取消', 'cancelled'], 3: ['已完成', 'paid'], 4: ['已折抵', 'converted'] })[Number(value)] || ['未知状态', 'unknown'];
}
export function orderPeriod(value) {
  return periods.find(item => item[0] === value)?.[1] || ({ reset_price: '流量重置', supplement: '补差价' })[value] || String(value || '—');
}
export function orderDate(value) {
  const date = new Date(Number(value) * 1000);
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}
export function filterOrders(orders, filter, search) {
  const statuses = { pending: [0], processing: [1], paid: [3, 4], cancelled: [2] };
  const query = search.trim().toLowerCase();
  return orders.filter(order => (!statuses[filter] || statuses[filter].includes(Number(order.status)))
    && (!query || `${order.trade_no} ${order.plan?.name || ''}`.toLowerCase().includes(query)));
}

export function createOrdersPage({ h, ref, onMounted, Layout, api, getConfig, navigate, confirm }) {
  return {
    name: '126Orders',
    setup() {
      const orders = ref([]), loading = ref(true), error = ref(''), busy = ref('');
      const filter = ref('all'), search = ref(''), page = ref(1);
      const price = value => `${getConfig().currency_symbol || '¥'}${money(value, 2)}`;
      const load = async () => {
        loading.value = true; error.value = '';
        try {
          const response = await api.get('/user/order/fetch');
          if (!Array.isArray(response.data)) throw new Error('暂时无法读取订单。');
          orders.value = response.data;
        } catch (failure) { error.value = failure.message || '订单加载失败，请重试。'; }
        finally { loading.value = false; }
      };
      onMounted(load);
      const cancel = async order => {
        if (busy.value || Number(order.status) !== 0 || !await confirm('如果已经付款，请等待支付结果。确定取消这笔待支付订单吗？')) return;
        busy.value = order.trade_no; error.value = '';
        try {
          const response = await api.post('/user/order/cancel', { trade_no: order.trade_no });
          if (response.data !== true) throw new Error('订单尚未取消，请刷新后重试。');
          await load();
        } catch (failure) { error.value = failure.message || '取消失败，请稍后重试。'; }
        finally { busy.value = ''; }
      };
      const row = order => {
        const [label, state] = orderStatus(order.status);
        return h('article', { class: 'orders-row', key: order.trade_no }, [
          h('div', { class: 'orders-product' }, [h('span', { class: 'orders-product-icon', 'aria-hidden': 'true' }, '↗'), h('div', {}, [h('strong', {}, order.plan?.name || '订阅套餐'), h('button', { type: 'button', class: 'orders-trade', onClick: () => navigate(`/order/${encodeURIComponent(order.trade_no)}`), 'aria-label': `查看订单 ${order.trade_no}` }, `# ${order.trade_no}`)])]),
          h('div', { class: 'orders-cycle', 'data-label': '购买周期' }, orderPeriod(order.period)),
          h('strong', { class: 'orders-amount', 'data-label': '订单金额' }, price(order.total_amount)),
          h('div', { class: 'orders-state' }, [h('span', { class: ['order-status', `is-${state}`] }, label)]),
          h('time', { class: 'orders-date', 'data-label': '创建时间' }, orderDate(order.created_at)),
          h('div', { class: 'orders-actions' }, [
            Number(order.status) === 0 ? h('button', { type: 'button', class: 'orders-pay', disabled: Boolean(busy.value), onClick: () => navigate(Number(order.type) === 5 ? `/order/${encodeURIComponent(order.trade_no)}` : `/plan?trade_no=${encodeURIComponent(order.trade_no)}`) }, '继续付款') : h('button', { type: 'button', class: 'orders-detail', onClick: () => navigate(`/order/${encodeURIComponent(order.trade_no)}`) }, '查看详情'),
            Number(order.status) === 0 && !(Number(order.type) === 5 && order.payment_id) ? h('button', { type: 'button', class: 'orders-cancel', disabled: Boolean(busy.value), onClick: () => cancel(order) }, busy.value === order.trade_no ? '取消中…' : '取消订单') : null,
          ]),
        ]);
      };
      return () => {
        const filtered = filterOrders(orders.value, filter.value, search.value);
        const pages = Math.max(1, Math.ceil(filtered.length / 10));
        const current = Math.min(page.value, pages);
        return h(Layout, {}, { default: () => [h('section', { class: 'orders-page', 'aria-labelledby': 'orders-title' }, [
          h('header', { class: 'orders-heading' }, [h('div', {}, [h('h1', { id: 'orders-title' }, '我的订单'), h('p', {}, '查看订阅记录，继续付款或管理待支付订单。')]), h('button', { type: 'button', class: 'orders-refresh', disabled: loading.value || Boolean(busy.value), onClick: load }, loading.value ? '刷新中…' : '刷新订单')]),
          h('div', { class: 'orders-stats' }, [['全部订单', orders.value.length], ['待支付', orders.value.filter(item => Number(item.status) === 0).length], ['已完成', orders.value.filter(item => [3, 4].includes(Number(item.status))).length]].map(([label, count]) => h('div', {}, [h('span', {}, label), h('strong', {}, String(count))]))),
          h('div', { class: 'orders-panel' }, [h('div', { class: 'orders-toolbar' }, [h('div', { class: 'orders-tabs', role: 'group', 'aria-label': '订单状态筛选' }, [['all', '全部'], ['pending', '待支付'], ['processing', '开通中'], ['paid', '已完成'], ['cancelled', '已取消']].map(([value, label]) => h('button', { type: 'button', class: filter.value === value && 'is-active', 'aria-pressed': filter.value === value, onClick: () => { filter.value = value; page.value = 1; } }, label))), h('input', { type: 'search', value: search.value, placeholder: '搜索订单号或套餐', 'aria-label': '搜索订单号或套餐', onInput: event => { search.value = event.target.value; page.value = 1; } })]),
            error.value ? h('div', { class: 'orders-error', role: 'alert' }, [h('span', {}, error.value), h('button', { type: 'button', onClick: load }, '重试')]) : null,
            loading.value ? h('div', { class: 'orders-empty', role: 'status' }, '正在加载订单…') : error.value && !orders.value.length ? null : filtered.length ? [h('div', { class: 'orders-columns', 'aria-hidden': 'true' }, ['套餐 / 订单号', '购买周期', '订单金额', '订单状态', '创建时间', '操作'].map(text => h('span', {}, text))), ...filtered.slice((current - 1) * 10, current * 10).map(row)] : h('div', { class: 'orders-empty' }, [h('span', { 'aria-hidden': 'true' }, '▤'), h('h2', {}, search.value || filter.value !== 'all' ? '没有找到符合条件的订单' : '还没有订阅订单'), h('p', {}, search.value || filter.value !== 'all' ? '试试其他关键词或订单状态。' : '选择适合你的套餐，开启新的连接体验。'), !search.value && filter.value === 'all' ? h('button', { type: 'button', onClick: () => navigate('/plan') }, '选购套餐') : null]),
            filtered.length ? h('footer', { class: 'orders-pagination' }, [h('span', {}, `共 ${filtered.length} 笔订单`), pages > 1 ? h('div', {}, [h('button', { type: 'button', disabled: current === 1, onClick: () => { page.value = current - 1; } }, '上一页'), h('span', {}, `${current} / ${pages}`), h('button', { type: 'button', disabled: current >= pages, onClick: () => { page.value = current + 1; } }, '下一页')]) : null]) : null,
          ]),
        ])] });
      };
    },
  };
}

export function createSupplementPage({ h, ref, onMounted, onUnmounted, Layout, QRCode, api, getConfig, navigate, productCode, tradeNo }) {
  const record = ref(null), methods = ref([]), choice = ref(null), error = ref('');
  const busy = ref(false), loading = ref(false), qr = ref('');
  const productPath = '/user/order/supplement/' + encodeURIComponent(productCode || '');
  const orderPath = '/user/order/detail?trade_no=' + encodeURIComponent(tradeNo || '');
  const price = cents => (getConfig().currency_symbol || '¥') + money(cents, 2);
  let poll;
  let disposed = false;

  async function load() {
    if (disposed || busy.value || loading.value) return;
    loading.value = true;
    error.value = '';
    try {
      const { data } = await api.get(productCode ? productPath : orderPath);
      if (!data || (!productCode && Number(data.type) !== 5)) throw new Error('找不到这笔补差价订单');
      record.value = data;
      if (tradeNo && Number(data.status) === 0) {
        const response = await api.get('/user/order/getPaymentMethod?supplement=1');
        methods.value = response.data.filter(method => !data.payment_id || Number(method.id) === Number(data.payment_id));
        choice.value = methods.value.find(method => Number(method.id) === Number(choice.value))?.id ?? methods.value[0]?.id ?? null;
      } else {
        qr.value = '';
        clearInterval(poll);
      }
    } catch (failure) { error.value = failure.message || '暂时无法读取补差价信息'; }
    finally { loading.value = false; }
  }

  onMounted(load);
  onUnmounted(() => { disposed = true; clearInterval(poll); });

  const selected = () => methods.value.find(method => Number(method.id) === Number(choice.value));
  const fee = () => {
    if (record.value.payment_id) return Number(record.value.handling_amount || 0);
    const method = selected();
    return Math.round(Number(record.value.total_amount) * Number(method?.handling_fee_percent || 0) / 100 + Number(method?.handling_fee_fixed || 0));
  };

  async function submit() {
    if (busy.value || loading.value) return;
    busy.value = true;
    error.value = '';
    try {
      if (productCode) {
        const order = record.value.trade_no || (await api.post(productPath, {})).data;
        if (!/^SUP[a-f0-9]{29}$/.test(order)) throw new Error('暂时无法创建订单，请重试');
        await navigate('/order/' + order);
        return;
      }
      if (!selected()) return;
      const payment = await api.post('/user/order/checkout', { trade_no: tradeNo, method: choice.value });
      if (disposed) return;
      if (payment.type === 0 && typeof payment.data === 'string' && payment.data) {
        qr.value = payment.data;
        clearInterval(poll);
        if (!disposed) poll = setInterval(async () => {
          try {
            const response = await api.get('/user/order/check?trade_no=' + encodeURIComponent(tradeNo));
            if (Number(response.data) !== 0) await load();
          } catch {}
        }, 3000);
      } else if (payment.type === 1 && typeof payment.data === 'string') {
        const destination = new URL(payment.data, location.origin);
        if (!['https:', 'http:'].includes(destination.protocol)) throw new Error('支付链接格式有误');
        location.assign(destination.href);
      } else {
        throw new Error('未获取到付款信息，请重试');
      }
    } catch (failure) { error.value = failure.message || '暂时无法发起付款'; }
    finally { busy.value = false; }
  }

  return () => h(Layout, {}, { default: () => h('section', { class: 'supplement-checkout', 'aria-labelledby': 'supplement-heading' }, [
    h('p', { class: 'supplement-label' }, '补差价 · 单次付款'),
    h('h1', { id: 'supplement-heading' }, record.value?.supplement_title || record.value?.title || '补差价'),
    loading.value ? h('p', { role: 'status' }, '正在加载…') : null,
    error.value ? h('p', { class: 'supplement-error', role: 'alert' }, error.value) : null,
    record.value && !loading.value ? [
      tradeNo ? h('p', { class: 'supplement-trade' }, '订单号 ' + tradeNo) : null,
      h('strong', { class: 'supplement-price' }, price(record.value.amount ?? record.value.total_amount)),
      productCode ? h('button', { class: 'supplement-pay', disabled: busy.value, onClick: submit }, busy.value ? '正在处理…' : Number(record.value.status) === 3 ? '查看已支付订单' : record.value.trade_no ? '继续付款' : '下单付款') : null,
      tradeNo && Number(record.value.status) === 3 ? h('p', { class: 'supplement-success', role: 'status' }, '付款成功') : null,
      tradeNo && Number(record.value.status) === 2 ? h('p', { role: 'status' }, '订单已取消，请重新打开套餐链接下单。') : null,
      tradeNo && Number(record.value.status) === 0 ? [
        methods.value.length ? h('label', {}, ['支付方式', h('select', { value: choice.value, disabled: busy.value || Boolean(record.value.payment_id) || Boolean(qr.value), onChange: event => { choice.value = Number(event.target.value); } }, methods.value.map(method => h('option', { value: method.id }, method.name)))]) : h('p', {}, '暂无可用的补差价支付方式，请联系管理员。'),
        fee() > 0 ? h('p', {}, '含手续费 ' + price(fee()) + '，应付 ' + price(Number(record.value.total_amount) + fee())) : null,
        qr.value ? h('div', { class: 'supplement-qr' }, [h(QRCode, { value: qr.value, size: 220 }), h('p', {}, '请扫码付款，页面将更新支付结果。')]) :
          h('button', { class: 'supplement-pay', disabled: busy.value || !selected(), onClick: submit }, busy.value ? '正在前往收银台…' : '立即付款'),
      ] : null,
    ] : null,
    tradeNo || error.value ? h('button', { class: 'supplement-refresh', disabled: loading.value || busy.value, onClick: load }, '刷新状态') : null,
  ]) });
}
