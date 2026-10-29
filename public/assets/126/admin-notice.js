export const noticePages = [
  ['dashboard', '仪表盘'], ['plan', '购买订阅'], ['order', '我的订单'],
  ['knowledge', '使用文档'], ['profile', '个人中心'], ['invite', '我的邀请'],
  ['ticket', '我的工单'], ['traffic', '流量明细'],
];

// Receives the admin application's existing React JSX runtime and form field.
export function noticePageField(jsx, field) {
  const selected = Array.isArray(field.value) ? field.value : ['dashboard'];
  return jsx.jsxs('fieldset', { style: { border: '1px solid #dce3ee', borderRadius: 10, padding: 16 }, children: [
    jsx.jsx('legend', { style: { fontWeight: 700, fontSize: 14, padding: '0 5px' }, children: '显示页面' }),
    jsx.jsx('p', { style: { fontSize: 12, opacity: .7, margin: '0 0 12px' }, children: '可多选；每个页面只直接展示排序最靠前的一条已启用公告。不勾选则不在用户端展示。' }),
    jsx.jsx('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '12px 22px' }, children: noticePages.map(([value, label]) => jsx.jsxs('label', {
      style: { display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 13 },
      children: [jsx.jsx('input', { type: 'checkbox', checked: selected.includes(value), onChange: event => field.onChange(event.target.checked ? [...selected, value] : selected.filter(page => page !== value)) }), label],
    }, value)) }),
  ] });
}
