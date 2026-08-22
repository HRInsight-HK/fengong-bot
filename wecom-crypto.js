/**
 * wecom-crypto.js — 企业微信消息加解密（WXBizMsgCrypt）
 * 纯 Node crypto 实现，零依赖。
 * 算法：AES-256-CBC，key = Base64Decode(EncodingAESKey + "=")，iv = key 前 16 字节
 * 明文结构：16 字节随机串 + 4 字节消息长度(网络字节序) + 消息明文 + receiveid
 * 填充：PKCS7，块大小 32
 */
'use strict';
const crypto = require('crypto');

class WXBizMsgCrypt {
  constructor(token, encodingAESKey, corpId) {
    if (!token || !encodingAESKey || !corpId) {
      throw new Error('WXBizMsgCrypt 需要提供 token / encodingAESKey / corpId');
    }
    this.token = token;
    this.corpId = corpId;
    this.aesKey = Buffer.from(encodingAESKey + '=', 'base64');
    if (this.aesKey.length !== 32) {
      throw new Error('EncodingAESKey 非法（解码后应为 32 字节）');
    }
    this.iv = this.aesKey.slice(0, 16);
  }

  /** 计算签名：sha1(sort([token, timestamp, nonce, encrypt])) */
  getSignature(timestamp, nonce, encrypt) {
    const raw = [this.token, String(timestamp), String(nonce), String(encrypt)].sort().join('');
    return crypto.createHash('sha1').update(raw, 'utf8').digest('hex');
  }

  /** 解密，返回明文 XML 字符串 */
  decrypt(encryptedBase64) {
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.aesKey, this.iv);
    decipher.setAutoPadding(false);
    let buf = Buffer.concat([decipher.update(Buffer.from(encryptedBase64, 'base64')), decipher.final()]);
    // 去 PKCS7 填充
    const pad = buf[buf.length - 1];
    buf = buf.slice(0, buf.length - pad);
    // 16 随机字节 + 4 字节长度 + 消息 + receiveid
    const msgLen = buf.readUInt32BE(16);
    const msg = buf.slice(20, 20 + msgLen).toString('utf8');
    return msg;
  }

  /** 加密明文，返回 base64 */
  encrypt(plainMsg) {
    const random = crypto.randomBytes(16);
    const msgBuf = Buffer.from(plainMsg, 'utf8');
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(msgBuf.length, 0);
    const data = Buffer.concat([random, lenBuf, msgBuf, Buffer.from(this.corpId, 'utf8')]);
    // PKCS7 填充到 32 的倍数
    const blockSize = 32;
    const padLen = blockSize - (data.length % blockSize);
    const padded = Buffer.concat([data, Buffer.alloc(padLen, padLen)]);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.aesKey, this.iv);
    cipher.setAutoPadding(false);
    return Buffer.concat([cipher.update(padded), cipher.final()]).toString('base64');
  }
}

module.exports = { WXBizMsgCrypt };
