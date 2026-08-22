# 分工小助手 · 上线部署指南

> 一句话：员工在企业微信里问一句"报销被驳回了找谁"，机器人直接回答部门 + 负责人。
> 知识库来自《各部门对外承接事项汇总.xlsx》（91 条，9 个板块）。

## 项目结构

```
bot/
├── server.js            主服务（零依赖，纯 Node 18+）
├── wecom-crypto.js      企微消息加解密（AES-256-CBC + SHA1 签名）
├── matcher.js           大白话匹配逻辑（同义词 + 二元组相似度）
├── data/knowledge.json  知识库（从 Excel 只读提取，91 条）
├── test-match.js        本地测试匹配：node test-match.js "报销被驳回找谁"
├── e2e-test.js          本地端到端回调测试
├── render.yaml          Render 部署配置
└── README.md            本文件
```

## 上线四步（约 15 分钟）

### 第 1 步：部署到 Render

1. 把 `bot/` 文件夹推到 GitHub 新仓库（或并入现有仓库子目录）
2. Render → New → Web Service → 连接该仓库
3. 注意 start command 是 `npm start`；render.yaml 已配好健康检查
4. 环境变量先随便填 3 个占位值（第 2 步拿到真实值后再回来改）：
   - `WECOM_CORP_ID`
   - `WECOM_TOKEN`
   - `WECOM_ENCODING_AES_KEY`
5. 部署完成后记下域名，形如 `https://fengong-bot.onrender.com`
6. 浏览器访问 `https://<域名>/` 应显示"分工小助手运行中 ✅"

### 第 2 步：企微管理后台拿 3 个值

登录 [企业微信管理后台](https://work.weixin.qq.com/wework_admin/loginpage_wx)：

1. **CorpID**：我的企业 → 企业信息 → 企业 ID（`ww` 开头）
2. 打开：应用管理 → **人事行政小助手**（已有自建应用，不用新建）
3. 往下找到「接收消息」→ **设置 API 接收**
   - URL 填：`https://<你的Render域名>/wecom/callback`
   - Token：点「随机获取」，记下来
   - EncodingAESKey：点「随机获取」，记下来
   - **先别点保存**——把 Token / AESKey / CorpID 填到 Render 环境变量里，等 Render 重新部署完成
   - 再回来点保存（企微会立刻 GET 验证，服务在线即通过 ✅）

### 第 3 步：验证

- 在企业微信打开「人事行政小助手」应用，发一句：`报销被驳回了找谁`
- 机器人应回复：财务部 · 报销 → 李妍婧

### 第 4 步：开放使用

- 应用可见范围先设为人事部 / 总务部试用，跑通后全员
- 建议把应用置顶到工作台，或发一条全员通知

## 数据更新

各部门事项变动时：

1. 改《各部门对外承接事项汇总.xlsx》对应工作表
2. 运行 `python gen_kb.py`（在 bot/ 上级目录，只读 Excel）重新生成 `data/knowledge.json`
3. push 到 GitHub → Render 手动 Deploy（Manual Deploy），即生效

## 常用命令

```bash
# 本地跑匹配测试
node test-match.js "社保要停缴"

# 本地起服务（需先 export 三个环境变量）
WECOM_CORP_ID=xx WECOM_TOKEN=xx WECOM_ENCODING_AES_KEY=xx PORT=3000 node server.js

# 本地端到端回调测试（另开终端）
node e2e-test.js
```

## 注意事项

- 免费版 Render 服务 15 分钟无访问会休眠，首条消息可能延迟几秒唤醒；介意可升 Starter
- 机器人回复是"被动回复"（5 秒内），当前匹配纯本地计算，毫秒级响应，无需外部 AI API
- `knowledge.json` 与 Excel 是镜像关系：Excel 是源，改 Excel → 重新生成 → 重新部署
