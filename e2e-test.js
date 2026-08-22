/**
 * e2e-test.js — 端到端模拟企微回调（验证 GET + 消息 POST + 回复解密）
 */
'use strict';
const http = require('http');
const { WXBizMsgCrypt } = require('./wecom-crypto');

const crypt = new WXBizMsgCrypt('test_token_123', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ', 'ww_test_corp');
const BASE = 'http://127.0.0.1:3456';

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(BASE + path, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

function post(path, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(BASE + path, { method: 'POST', headers: { 'Content-Type': 'text/xml' } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function xmlField(xml, tag) {
  let m = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`).exec(xml);
  if (m) return m[1];
  m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml);
  return m ? m[1] : '';
}

async function main() {
  // 1. 状态页
  let r = await get('/');
  console.log('[1] 状态页:', r.status, r.body.split('\n')[0]);

  // 2. 健康检查
  r = await get('/healthz');
  console.log('[2] 健康检查:', r.status, r.body);

  // 3. GET 验证（模拟企微保存回调 URL）
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = 'nonce123';
  const echoPlain = 'echo_random_string_5678';
  const echoEncrypted = crypt.encrypt(echoPlain);
  const sig = crypt.getSignature(ts, nonce, echoEncrypted);
  r = await get(`/wecom/callback?msg_signature=${encodeURIComponent(sig)}&timestamp=${ts}&nonce=${encodeURIComponent(nonce)}&echostr=${encodeURIComponent(echoEncrypted)}`);
  const pass = r.body === echoPlain;
  console.log('[3] URL 验证:', r.status, pass ? '✅ 回显一致' : `❌ 期望「${echoPlain}」实际「${r.body}」`);

  // 4. POST 消息（模拟员工提问）
  const questions = ['报销被驳回了，找谁？', '社保要停缴', '帮助'];
  for (const q of questions) {
    const inner = `<xml><ToUserName><![CDATA[ww_test_corp]]></ToUserName><FromUserName><![CDATA[zoe_test_user]]></FromUserName><CreateTime>${Math.floor(Date.now()/1000)}</CreateTime><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[${q}]]></Content><MsgId>1234567</MsgId><AgentID>1000002</AgentID></xml>`;
    const enc = crypt.encrypt(inner);
    const ts2 = String(Math.floor(Date.now() / 1000));
    const nc2 = 'nonce456';
    const sig2 = crypt.getSignature(ts2, nc2, enc);
    const body = `<xml><ToUserName><![CDATA[ww_test_corp]]></ToUserName><Encrypt><![CDATA[${enc}]]></Encrypt><AgentID><![CDATA[1000002]]></AgentID></xml>`;
    r = await post(`/wecom/callback?msg_signature=${encodeURIComponent(sig2)}&timestamp=${ts2}&nonce=${encodeURIComponent(nc2)}`, body);
    // 解密回复
    const replyEnc = xmlField(r.body, 'Encrypt');
    const replySig = xmlField(r.body, 'MsgSignature');
    const replyNonce = xmlField(r.body, 'Nonce');
    const replyTs = xmlField(r.body, 'TimeStamp');
    const expectSig = crypt.getSignature(replyTs, replyNonce, replyEnc);
    const sigOk = expectSig === replySig;
    const plain = crypt.decrypt(replyEnc);
    const replyContent = xmlField(plain, 'Content');
    const toUser = xmlField(plain, 'ToUserName');
    console.log(`\n[4] 问「${q}」`);
    console.log('    签名校验:', sigOk ? '✅' : '❌', '| 回复对象:', toUser === 'zoe_test_user' ? '✅' : '❌');
    console.log('    回复内容:');
    console.log(replyContent.split('\n').map(l => '      ' + l).join('\n'));
  }

  console.log('\n端到端测试完成');
}

main().catch(e => { console.error('测试失败:', e); process.exit(1); });
