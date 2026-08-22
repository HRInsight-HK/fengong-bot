/**
 * server.js — 分工小助手 · 企业微信自建应用回调服务
 * 零依赖（纯 Node http + 内置 crypto），Render / 任意 Node 18+ 环境可跑
 *
 * 环境变量：
 *   WECOM_CORP_ID          企业 ID（企微管理后台 → 我的企业 → 企业信息）
 *   WECOM_TOKEN            接收消息的 Token（应用 → 接收消息 → 设置 API 接收时生成）
 *   WECOM_ENCODING_AES_KEY 接收消息的 EncodingAESKey（同上）
 *   PORT                   端口（Render 自动注入，本地默认 3000）
 *
 * 路由：
 *   GET  /wecom/callback   企微回调 URL 验证（管理后台保存时触发）
 *   POST /wecom/callback   接收员工消息并被动回复
 *   GET  /healthz          健康检查
 *   GET  /                 状态页
 */
'use strict';
const http = require('http');
const { URL } = require('url');
const { WXBizMsgCrypt } = require('./wecom-crypto');
const { answer } = require('./matcher');

const PORT = process.env.PORT || 3000;
const CORP_ID = process.env.WECOM_CORP_ID;
const TOKEN = process.env.WECOM_TOKEN;
const AES_KEY = process.env.WECOM_ENCODING_AES_KEY;

if (!CORP_ID || !TOKEN || !AES_KEY) {
  console.warn('[提示] WECOM_CORP_ID / WECOM_TOKEN / WECOM_ENCODING_AES_KEY 未配置');
  console.warn('       回调会返回 503，直到这三个环境变量补齐。');
}

/** 延迟初始化 WXBizMsgCrypt：每次请求按需构建（env 已就位时才真正可用） */
let _crypt = null;
function getCrypt() {
  if (_crypt) return _crypt;
  if (!CORP_ID || !TOKEN || !AES_KEY) {
    const err = new Error('WECOM_CORP_ID / WECOM_TOKEN / WECOM_ENCODING_AES_KEY 未配置');
    err.code = 'NOT_CONFIGURED';
    throw err;
  }
  _crypt = new WXBizMsgCrypt(TOKEN, AES_KEY, CORP_ID);
  return _crypt;
}

/** 从 XML 里取字段（CDATA 或纯文本） */
function xmlField(xml, tag) {
  let m = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`).exec(xml);
  if (m) return m[1];
  m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml);
  return m ? m[1] : '';
}

function now() {
  return Math.floor(Date.now() / 1000);
}

/** 构造被动回复的加密 XML 外壳 */
function buildEncryptedReply(replyText, toUser, nonce) {
  const ts = now();
  const inner = [
    '<xml>',
    `<ToUserName><![CDATA[${toUser}]]></ToUserName>`,
    `<FromUserName><![CDATA[${CORP_ID}]]></FromUserName>`,
    `<CreateTime>${ts}</CreateTime>`,
    '<MsgType><![CDATA[text]]></MsgType>',
    `<Content><![CDATA[${replyText}]]></Content>`,
    '</xml>',
  ].join('');
  const encrypted = getCrypt().encrypt(inner);
  const sig = getCrypt().getSignature(ts, nonce, encrypted);
  return [
    '<xml>',
    `<Encrypt><![CDATA[${encrypted}]]></Encrypt>`,
    `<MsgSignature><![CDATA[${sig}]]></MsgSignature>`,
    `<TimeStamp>${ts}</TimeStamp>`,
    `<Nonce><![CDATA[${nonce}]]></Nonce>`,
    '</xml>',
  ].join('');
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname;

  // ---------- 健康检查 / 状态页 ----------
  if (path === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('ok');
  }
  if (path === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('分工小助手运行中 ✅\n回调地址：POST/GET /wecom/callback\n健康检查：/healthz');
  }

  // ---------- 企微回调 ----------
  if (path === '/wecom/callback') {
    const q = url.searchParams;
    const msgSignature = q.get('msg_signature') || '';
    const timestamp = q.get('timestamp') || '';
    const nonce = q.get('nonce') || '';

    // GET：URL 验证
    if (req.method === 'GET') {
      const echostr = q.get('echostr') || '';
      try {
        const crypt = getCrypt();
        const sig = crypt.getSignature(timestamp, nonce, echostr);
        if (sig !== msgSignature) {
          res.writeHead(403);
          return res.end('signature mismatch');
        }
        const plain = crypt.decrypt(echostr);
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        return res.end(plain);
      } catch (err) {
        console.error('[验证失败]', err.message);
        res.writeHead(500);
        return res.end('verify error');
      }
    }

    // POST：接收消息
    if (req.method === 'POST') {
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        try {
          const encrypted = xmlField(body, 'Encrypt');
          if (!encrypted) {
            res.writeHead(400);
            return res.end('bad xml');
          }
          const sig = getCrypt().getSignature(timestamp, nonce, encrypted);
          if (sig !== msgSignature) {
            res.writeHead(403);
            return res.end('signature mismatch');
          }
          const plainXml = getCrypt().decrypt(encrypted);
          const fromUser = xmlField(plainXml, 'FromUserName');
          const msgType = xmlField(plainXml, 'MsgType');
          const content = xmlField(plainXml, 'Content');
          const event = xmlField(plainXml, 'Event');

          console.log(`[消息] from=${fromUser} type=${msgType} event=${event} content=${content}`);

          let replyText;
          if (msgType === 'text' && content) {
            replyText = answer(content);
          } else if (msgType === 'event' && event === 'enter_agent') {
            replyText = answer('帮助');
          } else if (msgType === 'event' && event === 'subscribe') {
            replyText = answer('帮助');
          } else {
            replyText = '暂时只支持文字提问哦。直接用大白话问，例如：报销被驳回了找谁？';
          }

          res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8' });
          return res.end(buildEncryptedReply(replyText, fromUser, nonce));
        } catch (err) {
          console.error('[处理失败]', err);
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          return res.end(''); // 出错时回空串，避免企微重试风暴
        }
      });
      return;
    }

    res.writeHead(405);
    return res.end('method not allowed');
  }

  res.writeHead(404);
  res.end('not found');
});

// 全局兜底：任何未捕获异常只打印，不让进程退出
process.on('uncaughtException', err => {
  console.error('[uncaughtException]', err);
});
process.on('unhandledRejection', err => {
  console.error('[unhandledRejection]', err);
});

server.listen(PORT, () => {
  console.log(`[分工小助手] listening on :${PORT}`);
  console.log(`回调地址：https://<你的域名>/wecom/callback`);
});
