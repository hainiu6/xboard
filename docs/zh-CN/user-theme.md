# 126 用户端界面维护

默认 Xboard 主题新增品牌首页、登录页及套餐购买页，保持 Laravel API 与原有鉴权机制。

## 页面源码

- 首页：`theme/Xboard/home.blade.php`
- 页面入口和站点配置：`theme/Xboard/dashboard.blade.php`
- 全站样式：`public/assets/126/theme.css`
- 首页/登录/用户中心切换：`public/assets/126/portal.js`
- 套餐选择、优惠券与直接付款：`public/assets/126/plan-catalog.js`

套餐、周期、支付方式、手续费、优惠券及账户余额使用原有 API 数据。月均价格和周期节省金额只用于展示；创建订单后使用服务器返回的应付金额，再发起支付。跳转收银台或在当前页面显示二维码，不跳转原订单页。

有待付订单时可在当前页继续付款或取消；订单创建后锁定套餐和优惠券，付款失败重试复用原订单。余额全额抵扣时直接完成付款流程。支付接口不在预览或测试中访问真实线上订单。

## 编译主题桥接

上游只提供用户端编译产物。`scripts/build-user-theme.py` 将维护的套餐页接到原路由，并复用原 Vue、二维码组件和 API 客户端，保留鉴权、服务端校验和其他页面。

更换上游 `theme/Xboard/assets/umi.js` 后运行：

```bash
python3 scripts/build-user-theme.py
node tests/plan_catalog_test.mjs
```

脚本可重复执行；上游组件边界变化时会停止并要求检查。修改套餐页源码和样式不需要重新编译原前端。模板为资源添加版本标记，更新后可加载新资源。

不要在页面源码中填写实际价格、支付密钥或用户凭据。真实线上支付、到账回调和开通结果需在服务器更新后另行验证。
