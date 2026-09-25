# 货品物流成本核算

这是网站的完整源码，可部署到 Vercel。

## 文件说明

- `index.html`：网站页面、计算规则、PDF/Excel 导入和三语界面
- `api/product.js`：联网读取单个商品页面信息的 Vercel 接口
- `api/similar.js`：按商品名/网址搜索楽天市场同类热销商品并对比参数的 Vercel 接口
- `api/_lib/scrape.js`：两个接口共用的网页抓取/解析逻辑
- `api/fx.js`：转发 Wise 实时汇率数据的 Vercel 接口（浏览器直接调用 Wise 会被 CORS 拦截，所以走这个接口中转，不需要任何密钥）

## 部署到 Vercel

1. 将整个文件夹上传到 GitHub 仓库，或在 Vercel 选择直接导入项目。
2. Framework Preset 选择 `Other`。
3. Root Directory 保持项目根目录。
4. Build Command 和 Output Directory 均留空。
5. 在 Vercel 项目的 Settings → Environment Variables 中添加两个变量（都能在 [webservice.rakuten.co.jp](https://webservice.rakuten.co.jp/) 申请应用后的详情页里找到，用于「联网查询」页的同类商品搜索功能，缺任意一个都会报错，其余功能不受影响）：
   - `RAKUTEN_APP_ID`：应用详情页的 Application ID
   - `RAKUTEN_ACCESS_KEY`：应用详情页的 Access Key（点开眼睛图标查看）
6. 点击 Deploy。

### 关于楽天新版 Access Key（Web Application 类型）

如果注册应用时 Application Type 选的是 **Web Application**（Access Key 以 `pk_` 开头），楽天新网关要求请求必须带上与注册时「Allowed websites」一致的 `Origin` / `Referer` 请求头，否则会报 `REQUEST_CONTEXT_BODY_HTTP_REFERRER_MISSING`。`api/similar.js` 里已经写死了这两个头（`ALLOWED_WEBSITE` 常量），如果你的 Vercel 域名变了，记得同步改这个常量，并且去楽天应用详情页把「Allowed websites」也改成新域名。

## 本地预览

直接双击 `index.html` 可以查看基础页面。联网商品读取接口需要部署到 Vercel 后才能使用。

## 说明

报价和税费计算仅用于成本估算，最终金额请以承运商、报关行和税务单据为准。


## P2 实时物流追踪

追踪记录保存在所属货批中，每批可添加多条海运或空运记录。海运通过 AISStream.io WebSocket 按 MMSI 查询近期 AIS 船位；空运通过 adsb.fi 公共 ADS-B 数据按 ICAO24 地址或明确输入的 ADS-B 呼号查询飞机位置。航班号、呼号和 ICAO24 地址是独立字段；航班号不会被当作呼号查询。空运数据不包含 AWB 货物扫描、起讫地或 ETA，缺失数据保持为空，手工输入的路线和时间会保留。飞机落地或运输到达不会自动表示货物已清关或签收。

在 Vercel 的项目环境变量中仅需为海运配置服务端密钥：

- `AISSTREAM_API_KEY`：在 [AISStream.io](https://aisstream.io/) 获取。密钥仅在服务端 `/api/tracking/sea` 使用，不能放入浏览器代码。

部署在 Vercel 时，请将 `AISSTREAM_API_KEY` 同时配置到 **Preview** 和 **Production** 环境；P2 功能分支生成的是 Preview 部署。`/api/tracking/status` 只返回 `configured: true/false`，不会返回密钥。

空运查询不需要密钥。adsb.fi 公共 API 仅供个人非商业用途，公开端点限速约为每秒 1 次；请遵守 [adsb.fi 数据使用说明](https://github.com/adsbfi/opendata/blob/main/README.md)，页面会标注数据来源。adsb.fi 只返回 ADS-B 网络当前可见的飞机；未查到广播不代表飞机不存在。AISStream 是实时 AIS 事件流，不保证打开网页后立刻产生新的船位报告；已确认订阅但等待窗口内没有报告会作为 `no_new_position` 成功响应。页面将保留最后已知坐标，并清楚标注其位置时间，不会显示成实时位置。海运查询仅在进入追踪页或手动刷新时执行，空运页面可见时约每 60 秒刷新，页面隐藏或记录完成后停止轮询。Vercel 实例内有短期缓存，不是跨实例共享缓存。AIS/ADS-B 覆盖取决于接收站、目标应答和供应商数据可用性。

地图使用 OpenStreetMap 瓦片并显示署名。路线总览只用实线连接起点与当前位置、虚线连接当前位置与目的地；没有实际历史轨迹时，不绘制或暗示历史航迹。

本地回归检查：在源码目录运行 `node tests/phase0.test.mjs`、`node tests/phase1-a.test.mjs`、`node tests/phase1-b.test.mjs`、`node tests/phase1-c.test.mjs`、`node tests/phase1-d.test.mjs` 和 `node tests/phase2.test.mjs`。
