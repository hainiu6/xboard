#!/usr/bin/env python3
"""Bridge maintained 126 UI source to the shipped Xboard frontend; idempotent.
Run after an upstream theme update. Fail if its component boundary changes.
"""
from pathlib import Path
import re
import hashlib

root = Path(__file__).resolve().parents[1]
bundle = root / 'theme/Xboard/assets/umi.js'
source = bundle.read_text()
bridge = '''/*126_PLAN_CATALOG*/(window.Xboard126&&typeof window.Xboard126.createPlansPage==="function"?window.Xboard126.createPlansPage({h:Lr,ref:Et,onMounted:Dn,onUnmounted:Wn,Layout:Zj,QRCode:h$,Modal:RI,api:{get:e=>EN.get(e),post:(e,t)=>EN.post(e,t)},getConfig:()=>_N().appConfig,getUser:()=>BN().userInfo,refreshUser:()=>BN().getUserInfo(),confirm:e=>Promise.resolve(window.confirm(e)),openPayment:e=>window.location.assign(e),navigate:e=>qN.push(e),getRequestedOrder:()=>qN.currentRoute.value.query.trade_no}):OX)/*126_END*/'''
if '/*126_PLAN_CATALOG*/' in source:
    source, count = re.subn(r'/\*126_PLAN_CATALOG\*/.*?/\*126_END\*/', lambda _: bridge, source)
else:
    marker = 'MX=Object.freeze(Object.defineProperty({__proto__:null,default:OX},Symbol.toStringTag,{value:"Module"}))'
    count = source.count(marker)
    source = source.replace(marker, marker.replace('default:OX', 'default:' + bridge))
if count != 1:
    raise SystemExit('Cannot locate the plan catalog component. Review the upstream frontend before building.')
source = re.sub(r';/\*126_SELECTED_PERIOD\*/.*?/\*126_END_PERIOD\*/', '', source)
# Keep the homepage action in the existing application toolbar.
header_original = 'Ir("div",jj,[Lr($j),Lr(Oj),Lr(xj),Lr(Aj)])'
header_replacement = 'Ir("div",jj,[/*126_HOME_LINK*/Ir("a",{href:"/",class:"portal-home-button"},"返回首页"),/*126_END_HOME*/Lr($j),Lr(Oj),Lr(xj),Lr(Aj)])'
if '/*126_HOME_LINK*/' not in source:
    if source.count(header_original) != 1:
        raise SystemExit('Cannot locate the application toolbar. Review the upstream frontend.')
    source = source.replace(header_original, header_replacement)
source = source.replace('Wj={class:"flex flex-col flex-1 overflow-hidden"}', 'Wj={class:"portal-app-main flex flex-col flex-1 overflow-hidden"}')
def replace_once(old, new):
    global source
    if old in source:
        if source.count(old) != 1:
            raise SystemExit('Ambiguous frontend boundary: ' + old[:70])
        source = source.replace(old, new)
    elif new not in source:
        raise SystemExit('Cannot locate frontend boundary: ' + old[:70])

# User credentials already expire after one year on the server.
replace_once('function PN(e){sd.set("access_token",e,21600)}', 'function PN(e){sd.set("access_token",e,31536000)}')
replace_once('redirect:"/node",meta:{isHidden:!1}', 'redirect:"/node",meta:{isHidden:!0}')
replace_once('title:"购买订阅",icon:"mdi-shopping-outline",order:10,group:{key:"subscribe",label:"订阅"}', 'title:"购买订阅",icon:"mdi-shopping-outline",order:11')
replace_once('JN={class:"h-15 f-c-c relative"}', 'JN={class:"portal-side-logo h-15 f-c-c relative"}')

orders_bridge = '/*126_ORDERS*/(window.Xboard126&&window.Xboard126.createOrdersPage?window.Xboard126.createOrdersPage({h:Lr,ref:Et,onMounted:Dn,Layout:Zj,api:{get:e=>EN.get(e),post:(e,t)=>EN.post(e,t)},getConfig:()=>_N().appConfig,navigate:e=>qN.push(e),confirm:e=>Promise.resolve(window.confirm(e))}):UK)/*126_END_ORDERS*/'
if '/*126_ORDERS*/' in source:
    source = re.sub(r'/\*126_ORDERS\*/.*?/\*126_END_ORDERS\*/', lambda _: orders_bridge, source)
else:
    replace_once('VK=Object.freeze(Object.defineProperty({__proto__:null,default:UK},Symbol.toStringTag,{value:"Module"}))', 'VK=Object.freeze(Object.defineProperty({__proto__:null,default:'+orders_bridge+'},Symbol.toStringTag,{value:"Module"}))')

# The common page layout renders an inline announcement, including on route changes.
notice_component = 'window.Xboard126&&window.Xboard126.createNotice?(window.Xboard126.Notice||(window.Xboard126.Notice=window.Xboard126.createNotice({h:Lr,ref:Et,onMounted:Dn,onUnmounted:Wn,api:{get:e=>EN.get(e)},getPath:()=>qN.currentRoute.value.path,renderMarkdown:e=>new qV({html:!0,breaks:!0,linkify:!0}).render(e)}))):null'
replace_once('const o=Yj,r=$E;return _r(),Rr(vi', 'const o=Yj,r=$E,a='+notice_component+';return _r(),Rr(vi')
replace_once('Ir("section",Qj,[to(t.$slots,"default"),e.showFooter?', 'Ir("section",Qj,[a?Lr(a):null,to(t.$slots,"default"),e.showFooter?')
old_notice = 'M=()=>v(this,null,(function*(){const{data:e}=yield EN.get("/user/notice/fetch");z.value=e;const t=e.find((e=>{var t;return null==(t=e.tags)?void 0:t.includes("弹窗")}));t&&(s.value=!0,c.value=t)}))'
replace_once(old_notice, 'M=()=>Promise.resolve()/*126_INLINE_NOTICE*/')
bundle.write_text(source)

# Generate an isolated admin entry; never modify the upstream Git submodule.
import json
manifest = json.loads((root / 'public/assets/admin/manifest.json').read_text())
entry = manifest['index.html']['file']
admin = (root / 'public/assets/admin' / entry).read_text()
patches = json.loads((root / 'resources/ui/admin-notice-bridge.json').read_text())
start = admin.find(patches['start'])
end = admin.find(patches['end'], start)
if start < 0 or end < 0:
    raise SystemExit('Cannot locate the admin notice form. Review the upstream admin frontend.')
form = admin[start:end]
for old, new in patches['replacements']:
    if form.count(old) != 1:
        raise SystemExit('Cannot locate the admin notice form boundary: ' + old[:60])
    form = form.replace(old, new)
admin = admin[:start] + form + admin[end:]
digest = hashlib.sha256((root / 'public/assets/126/admin-notice.js').read_bytes()).hexdigest()[:12]
admin = 'import{noticePageField as renderNoticePages}from"/assets/126/admin-notice.js?v='+digest+'";' + admin
# Worker and lazy asset URLs still resolve relative to the original admin entry.
admin = admin.replace('import.meta.url', 'new URL('+json.dumps('/assets/admin/'+entry, ensure_ascii=False, separators=(',', ':'))+',window.location.origin).href')
output = root / 'public/theme/126-admin'
output.mkdir(parents=True, exist_ok=True)
filename = 'admin-app.' + hashlib.sha256(admin.encode()).hexdigest()[:20] + '.js'
(output / filename).write_text(admin)
print('126 admin preview entry is ready: /theme/126-admin/' + filename)
