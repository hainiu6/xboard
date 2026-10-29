import { money, periods } from './plan-catalog.js';

export function orderStatus(value) {
  return ({ 0: ['待支付', 'pending'], 1: ['开通中', 'processing'], 2: ['已取消', 'cancelled'], 3: ['已完成', 'paid'], 4: ['已折抵', 'converted'] })[Number(value)] || ['未知状态', 'unknown'];
}
export function orderPeriod(value) {
  return periods.find(item => item[0] === value)?.[1] || ({ reset_price: '流量重置' })[value] || String(value || '—');
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
            Number(order.status) === 0 ? h('button', { type: 'button', class: 'orders-pay', disabled: Boolean(busy.value), onClick: () => navigate(`/plan?trade_no=${encodeURIComponent(order.trade_no)}`) }, '继续付款') : h('button', { type: 'button', class: 'orders-detail', onClick: () => navigate(`/order/${encodeURIComponent(order.trade_no)}`) }, '查看详情'),
            Number(order.status) === 0 ? h('button', { type: 'button', class: 'orders-cancel', disabled: Boolean(busy.value), onClick: () => cancel(order) }, busy.value === order.trade_no ? '取消中…' : '取消订单') : null,
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
