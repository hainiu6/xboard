#!/usr/bin/env python3
"""Bridge maintained 126 UI source to the shipped Xboard frontend; idempotent.
Run after an upstream theme update. Fail if its component boundary changes.
"""
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
bundle = root / 'theme/Xboard/assets/umi.js'
source = bundle.read_text()
bridge = '''/*126_PLAN_CATALOG*/(window.Xboard126&&typeof window.Xboard126.createPlansPage==="function"?window.Xboard126.createPlansPage({h:Lr,ref:Et,onMounted:Dn,onUnmounted:Wn,Layout:Zj,QRCode:h$,Modal:RI,api:{get:e=>EN.get(e),post:(e,t)=>EN.post(e,t)},getConfig:()=>_N().appConfig,getUser:()=>BN().userInfo,refreshUser:()=>BN().getUserInfo(),confirm:e=>Promise.resolve(window.confirm(e)),openPayment:e=>window.location.assign(e),navigate:e=>qN.push(e)}):OX)/*126_END*/'''
if '/*126_PLAN_CATALOG*/' in source:
    source, count = re.subn(r'/\*126_PLAN_CATALOG\*/.*?/\*126_END\*/', lambda _: bridge, source)
else:
    marker = 'MX=Object.freeze(Object.defineProperty({__proto__:null,default:OX},Symbol.toStringTag,{value:"Module"}))'
    count = source.count(marker)
    source = source.replace(marker, marker.replace('default:OX', 'default:' + bridge))
if count != 1:
    raise SystemExit('Cannot locate the plan catalog component. Review the upstream frontend before building.')
source = re.sub(r';/\*126_SELECTED_PERIOD\*/.*?/\*126_END_PERIOD\*/', '', source)
bundle.write_text(source)
print('126 plan catalog bridge is ready.')
