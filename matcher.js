/**
 * matcher.js — 大白话问题 → 知识库匹配
 * 数据源：data/knowledge.json（由《各部门对外承接事项汇总.xlsx》只读提取，91 条）
 * 策略：同义词扩展命中加权 + 字符二元组 Dice 相似度，多命中时列 Top3
 */
'use strict';
const kb = require('./data/knowledge.json');
const ENTRIES = kb.entries;

/** 大白话 → 知识库词汇的同义词映射 */
const SYNONYMS = {
  打卡: ['考勤'], 打卡机: ['考勤'], 补卡: ['考勤'],
  房租: ['房补'], 房补: ['房补'],
  订票: ['差旅', '出差'], 订机票: ['差旅', '出差'], 机票: ['差旅', '出差'],
  火车票: ['差旅', '出差'], 车票: ['差旅', '出差'], 出差: ['出差', '差旅'],
  社保: ['社保公积金'], 公积金: ['社保公积金'], 停缴: ['停缴'], 转档: ['转档'],
  工资条: ['工资单', '工资条'], 工资单: ['工资单'], 工资: ['发放工资', '工资'],
  没发工资: ['发放工资'], 薪资: ['薪资变动', '工资'],
  离职: ['入转调离'], 入职: ['入转调离', '入职'], 转正: ['试用期'], 试用期: ['试用期', '入转调离'],
  调岗: ['人员异动', '岗位变动'], 升职: ['职级调整', '人员异动'], 加薪: ['薪资变动', '人员异动'],
  盖章: ['用印', '印章'], 合同章: ['用印', '印章'], 公章: ['用印', '印章'], 印章: ['印章', '用印'],
  快递: ['收发快递'], 名片: ['名片制作'], 打印: ['打印'], 复印: ['打印扫描'],
  维修: ['维修'], 打印机: ['打印机'], 物业: ['物业'], 饮用水: ['饮用水'], 保洁: ['清洁'],
  报关: ['报关'], 清关: ['报关'],
  退货: ['退货', '退换货'], 换货: ['退换货'], 退款: ['退款'], 售后: ['售后'],
  汇率: ['汇率'], 港币: ['港币'], 开单: ['开单'], 加急: ['加急'], 配货: ['配货'],
  出库: ['出库'], 入库: ['入库'], 调拨: ['调拨'], 寄存: ['寄存'], 寄售: ['寄售'],
  供应商: ['供应商'], 新供应商: ['供应商', '报备认证'], 现货表: ['现货表'], 报价: ['报价'],
  ERP: ['ERP'], 金蝶: ['金蝶'], 权限: ['权限管理'], 账号: ['账号'], VPN: ['VPN'],
  WhatsApp: ['账号'], 实名认证: ['账号'], 手机号: ['账号'],
  招聘: ['招聘'], 面试: ['面试'], 简历: ['招聘'], 培训: ['培训'], 内购: ['内购'],
  提成: ['提成'], 奖金: ['奖金'], 报销: ['报销'], 备用金: ['备用金'],
  花名册: ['花名册'], 职级: ['职级'], 档案: ['档案管理'], 借阅: ['借阅'], 营业执照: ['营业执照'],
  会议: ['会议准备'], 接待: ['接待'], 客户到访: ['客户到访'], 到仓: ['客户到访'],
  参观: ['客户到访'], 来仓库: ['客户到访'], 来仓: ['客户到访'], 拜访: ['客户到访'],
  会议室: ['会议准备'], 工作号: ['工作号'], 邮箱: ['邮箱'], 企微: ['企业微信主体'],
  六面图: ['六面图'], 直播: ['直播'], 送礼: ['送礼'], 车费: ['车费'], 对账: ['对账'],
  欠款: ['欠款'], 余款: ['余款'], 激活: ['待激活'], 客户编码: ['客户编码'],
  新客户: ['新客户'], 取号: ['取号'], 跟单员: ['跟单员'], 提货: ['提货'],
};

/** 从问题里剔除的口水词（长词优先） */
const STOPWORDS = [
  '找谁办', '怎么办', '该怎么', '请问', '帮我', '帮忙', '一下', '我要', '需要',
  '什么事', '什么情况', '哪个', '是谁', '找谁', '谁办', '谁负责', '负责',
  '我想', '怎么', '怎样', '如何', '可以', '应该', '还是', '还有', '以及',
  '公司', '我们', '他们', '你好', '您好', '请问下', '咨询', '处理', '办理',
  '？', '?', '，', ',', '。', '！', '！', '、', '：', ':', '的', '了', '吗', '呢',
  '啊', '哦', '呀', '我', '你', '他', '她', '这', '那', '个', '有', '在', '是', '找', '要', '办', '去', '下',
];

function cleanQuery(q) {
  let s = q;
  for (const w of STOPWORDS) s = s.split(w).join('');
  return s;
}

/** 字符二元组集合 */
function bigrams(s) {
  const set = new Map();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    set.set(g, (set.get(g) || 0) + 1);
  }
  return set;
}

/** Dice 相似度（0~1） */
function dice(a, b) {
  if (a.length < 2 || b.length < 2) return 0;
  const ga = bigrams(a), gb = bigrams(b);
  let overlap = 0, total = 0;
  for (const [g, n] of ga) {
    total += n;
    if (gb.has(g)) overlap += Math.min(n, gb.get(g));
  }
  for (const [, n] of gb) total += n;
  return total === 0 ? 0 : (2 * overlap) / total;
}

function entryText(e) {
  return [e.item, e.when, e.module, e.dept, e.primary].filter(Boolean).join(' ');
}

/** 对单条知识打分 */
function scoreEntry(e, cleanedQuery, terms) {
  const text = entryText(e);
  let score = 0;
  for (const t of terms) {
    if (t && text.includes(t)) score += Math.min(t.length, 4) * 2;
  }
  score += dice(cleanedQuery, text) * 10;
  // 人名直接命中给高权重
  if (e.primary && cleanedQuery.includes(e.primary)) score += 10;
  return score;
}

function formatEntry(e, idx) {
  const lines = [];
  if (idx != null) lines.push(`${idx}. ${e.dept}${e.module ? ' · ' + e.module : ''}`);
  else lines.push(`【${e.dept}${e.module ? ' · ' + e.module : ''}】`);
  lines.push(`事项：${e.item}`);
  if (e.when && e.when !== '/') lines.push(`什么情况：${e.when}`);
  lines.push(`主要负责人：${e.primary}`);
  if (e.backup && e.backup !== '/' && e.backup !== e.primary) lines.push(`备份负责人：${e.backup}`);
  return lines.join('\n');
}

function helpText() {
  return [
    '我是分工小助手，直接用大白话问我就行 👇',
    '',
    '比如：',
    '· 报销被驳回了找谁',
    '· 货要加急配货',
    '· 社保要停缴',
    '· 下周出差帮我订票',
    '· 海外客户订单要报关',
    '',
    '已收录 9 个板块共 ' + ENTRIES.length + ' 条对接事项：总务部 / 销售秘书处 / 财务部 / 人事部 / 采购部 / 效率部 / 自营部 / 香港仓库 / 内贸部',
    '回复「帮助」看本提示',
  ].join('\n');
}

/** 主入口：传入用户问题，返回回复文本 */
function answer(rawQuery) {
  const query = String(rawQuery || '').trim();
  if (!query) return helpText();
  if (/^(帮助|help|菜单|hi|你好|您好|hello)$/i.test(query)) return helpText();

  const cleaned = cleanQuery(query);
  if (!cleaned && query.length <= 6) return helpText();

  // 同义词扩展
  const terms = [];
  for (const [k, vs] of Object.entries(SYNONYMS)) {
    if (query.includes(k)) terms.push(...vs);
  }

  const scored = ENTRIES
    .map(e => ({ e, score: scoreEntry(e, cleaned || query, terms) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  // 门槛：至少 2.5 分（一个 2 字词命中 + 一点相似度）
  if (!best || best.score < 2.5) {
    return [
      '这个问题我还没学到 😥，可能不在分工表里。',
      '',
      '可以先试试这些热门问题：',
      '· 报销 / 工资条 / 提成 → 财务部',
      '· 加急配货 / 出库 / 报关 → 总务部',
      '· 社保 / 出差订票 / 盖章 → 人事部',
      '',
      '如果是表里没有的事项，请联系 @Zoe（人事/SSC）补充进《各部门对外承接事项汇总》。',
    ].join('\n');
  }

  // 多命中：第 2、3 名分数 ≥ 最佳的 70% 时列候选
  const cands = scored.filter(s => s.score >= best.score * 0.7).slice(0, 3);
  if (cands.length >= 2) {
    const parts = ['帮你找到 ' + cands.length + ' 个可能相关的，看看是哪个 👇', ''];
    cands.forEach((c, i) => {
      parts.push(formatEntry(c.e, i + 1));
      parts.push('');
    });
    parts.push('💡 在企业微信搜名字即可发起会话');
    return parts.join('\n');
  }

  // 唯一命中
  const e = best.e;
  const parts = ['✅ 找到了', '', formatEntry(e), '', '💡 在企业微信搜名字即可发起会话'];
  return parts.join('\n');
}

module.exports = { answer, helpText };
