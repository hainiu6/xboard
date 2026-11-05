export function SupplementOrderButton({ react, submit, list }) {
  const h = react.createElement;
  const dialog = react.useRef(null);
  const sending = react.useRef(false);
  const [busy, setBusy] = react.useState(false);
  const [result, setResult] = react.useState(null);
  const [error, setError] = react.useState('');
  const [copied, setCopied] = react.useState(false);
  const [products, setProducts] = react.useState([]);

  async function open() {
    dialog.current.showModal();
    try { setProducts((await list()).data || []); }
    catch (failure) { setError(failure.message || '无法读取补差价套餐'); }
  }

  function share(product) {
    if (!/^\/#\/supplement\/[a-f0-9]{32}$/.test(product.payment_path)) throw new Error('付款链接格式有误');
    setCopied(false);
    setResult({ url: new URL(product.payment_path, location.origin).href, title: product.title });
  }

  async function create(event) {
    event.preventDefault();
    if (sending.current || result) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      const fields = new FormData(event.currentTarget);
      const { data: product } = await submit({
        title: fields.get('title').trim(),
        amount: fields.get('amount').trim(),
      });
      share(product);
      setProducts(items => [product, ...items]);
    } catch (failure) {
      setError(failure.message || '创建失败，请检查输入后重试');
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return h(react.Fragment, null,
    h('button', { type: 'button', className: 'supplement-admin-trigger', onClick: open }, '补差价套餐'),
    h('dialog', { ref: dialog, className: 'supplement-admin-dialog', 'aria-labelledby': 'supplement-admin-title',
      onCancel: event => { if (sending.current) event.preventDefault(); } },
    h('form', { onSubmit: create },
      h('h2', { id: 'supplement-admin-title' }, '补差价套餐'),
      h('p', null, '创建套餐后，把通用链接发给需要补差价的用户。'),
      result ? h('div', { className: 'supplement-admin-result' },
        h('strong', null, result.title),
        h('label', null, '付款链接', h('input', { readOnly: true, value: result.url, onFocus: event => event.target.select() })),
        h('button', { type: 'button', className: 'supplement-admin-primary', onClick: async () => {
          try { await navigator.clipboard.writeText(result.url); setCopied(true); }
          catch { setError('请选中付款链接并手动复制'); }
        } }, copied ? '已复制' : '复制付款链接')
      ) : h(react.Fragment, null,
        h('label', null, '套餐名称', h('input', { name: 'title', defaultValue: '补差价', required: true, maxLength: 100 })),
        h('label', null, '套餐金额', h('input', { name: 'amount', required: true, inputMode: 'decimal', pattern: '(0|[1-9][0-9]{0,5})([.][0-9]{1,2})?', placeholder: '例如 25.00' })),
        products.length > 0 && h('div', { className: 'supplement-admin-products' },
          h('strong', null, '已创建的套餐'),
          products.map(product => h('button', { key: product.payment_path, type: 'button', disabled: busy,
            onClick: () => { setError(''); share(product); } },
          product.title + ' · ' + (product.amount / 100).toFixed(2) + ' · 查看链接'))
        )
      ),
      error && h('p', { role: 'alert', className: 'supplement-admin-error' }, error),
      h('footer', null,
        h('button', { type: 'button', disabled: busy, onClick: () => dialog.current.close() }, '关闭'),
        result
          ? h('button', { type: 'button', onClick: () => { setResult(null); setError(''); setCopied(false); } }, '继续创建')
          : h('button', { type: 'submit', disabled: busy, className: 'supplement-admin-primary' }, busy ? '创建中…' : '创建套餐并生成链接')
      )
    ))
  );
}
