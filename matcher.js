/**
 * matcher.js — 大白话问题 → 知识库匹配
 * 数据源：data/knowledge.json（由《各部门对外承接事项汇总.xlsx》只读提取，93 条）
 * 策略：同义词扩展命中加权 + 字符二元组 Dice 相似度，多命中时列 Top3
 */
'use strict';
const kb = require('./data/knowledge.json');
const ENTRIES = kb.entries;

/** 大白话 → 知识库词汇的同义词映射 */
const SYNONYMS = {
  打卡: ['考勤'], 打卡机: ['考勤'], 补卡: ['考勤'],
  录指纹: ['考勤管理'], 指纹: ['考勤管理'], 指纹签到: ['考勤管理'], 指纹打卡: ['考勤管理'],
  考勤: ['考勤管理'], 考勤机: ['考勤管理'], 考勤异常: ['考勤管理'],
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
  香港: ['香港仓库'], 香港仓: ['香港仓库'], 香港分部: ['香港仓库'],
  仓库: ['香港仓库'], 货仓: ['香港仓库'],
  拣货: ['拣货', '配货'], 点货: ['点货', '货物清点'], 收货: ['货物接收', '点货'],
  出货: ['出库'], 打包: ['打包'], 抽货: ['抽货'], 合并发货: ['售前合并', '合并'],
  按摩: ['按摩'], 头疗: ['头疗'], 健身房: ['健身房'], 福利金: ['福利金'],
  门禁: ['门禁卡'], 门禁卡: ['门禁卡'], 卡片: ['门禁卡'], 办卡: ['门禁卡'], 补卡: ['门禁卡'],
  宣传: ['宣传部'], 宣传部: ['宣传部'], 公司资料: ['宣传部'], 文化墙: ['宣传部'], 宣传物料: ['宣传部'],
  海报: ['宣传部'], 展架: ['宣传部'], 宣传册: ['宣传部'], 品牌资料: ['宣传部'], 活动物料: ['宣传部'],
  // 人事部 板块名直接当关键词
  人员异动: ['人员异动'], 薪酬福利: ['薪酬福利'], 入转调离: ['入转调离'],
  人力数据: ['人力数据'], 考勤管理: ['考勤管理'], 用印管理: ['用印管理'],
  行政费用: ['行政费用'], 会务外联: ['会务外联'], 后勤保障: ['办公环境'],
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
    '已收录 10 个板块共 ' + ENTRIES.length + ' 条对接事项：总务部 / 销售秘书处 / 财务部 / 人事部 / 采购部 / 效率部 / 自营部 / 香港仓库 / 内贸部 / 宣传部',
    '直接发部门名也行：香港 / 仓库 / 内贸销售 / 自营平台 / 总务 / 采购 / 财务 / 人事 / 秘书处 / 宣传 / 文化墙 / 公司资料',
    '回复「帮助」看本提示',
  ].join('\n');
}

/** 部门直达：把某个部门的全部对接事项列成清单 */
/** 部门别名 → 标准部门名（用户叫法千奇百怪，全部归一） */
const DEPT_ALIAS_ENTRIES = {
  '香港仓库': ['香港', '香港仓', '香港分部', '仓库', '货仓', 'HK仓', 'hk仓'],
  '内贸部': ['内贸', '内贸销售'],
  '总务部': ['总务'],
  '财务部': ['财务'],
  '自营部': ['自营', '自营平台'],
  '效率部': ['效率'],
  '采购部': ['采购'],
  '人事部': ['人事'],
  '销售秘书处': ['销售秘书', '秘书处', '秘书'],
  '宣传部': ['宣传', '宣传部', '文化墙', '宣传物料', '公司资料', 'Yuna'],
};
const DEPT_ALIAS = {};
for (const [dept, aliases] of Object.entries(DEPT_ALIAS_ENTRIES)) {
  DEPT_ALIAS[dept] = dept;
  for (const a of aliases) DEPT_ALIAS[a] = dept;
}
/** 部门名后缀（「内贸」+「销售」=「内贸销售」也算部门查询） */
const DEPT_SUFFIXES = new Set(['', '部', '分部', '平台', '仓', '仓库', '销售', '销售部', '平台部', '秘书处']);

/** 模糊识别部门：精确别名 / 别名包含 / 别名+后缀，返回标准部门名或 null */
function findDept(cleaned) {
  if (!cleaned || cleaned.length < 2) return null;
  if (DEPT_ALIAS[cleaned]) return DEPT_ALIAS[cleaned];
  // 用户输入是部门名的一部分（如「总务」⊂「总务部」）
  for (const alias of Object.keys(DEPT_ALIAS)) {
    if (alias.length >= 2 && alias.includes(cleaned)) return DEPT_ALIAS[alias];
  }
  // 用户输入 = 部门别名 + 部门后缀（如「内贸」+「销售」）
  for (const alias of Object.keys(DEPT_ALIAS)) {
    if (alias.length >= 2 && cleaned.startsWith(alias) && DEPT_SUFFIXES.has(cleaned.slice(alias.length))) {
      return DEPT_ALIAS[alias];
    }
  }
  return null;
}

/** 部门直达：把某个部门的全部对接事项列成清单（文字版 + 表格版） */
function deptListing(dept) {
  const list = ENTRIES.filter(e => e.dept === dept);
  const parts = [`【${dept}】共 ${list.length} 条对接事项：`, ''];
  const rows = [];
  list.forEach(e => {
    const mod = (e.module && e.module !== '/') ? e.module + ' · ' : '';
    const hasBackup = e.backup && e.backup !== '/' && e.backup !== e.primary;
    parts.push(`· ${mod}${e.item} → ${e.primary}${hasBackup ? `（备份：${e.backup}）` : ''}`);
    rows.push([
      (e.module && e.module !== '/') ? e.module : '—',
      e.item,
      e.primary,
      hasBackup ? e.backup : '—',
    ]);
  });
  parts.push('', '💡 在企业微信搜名字即可发起会话');
  return {
    text: parts.join('\n'),
    table: {
      title: dept + ' · 共 ' + list.length + ' 条',
      columns: ['小组', '对外承接事项', '主要负责人', '备份负责人'],
      rows,
    },
  };
}

/** 主入口：传入用户问题，返回回复文本 */
function answer(rawQuery) {
  const query = String(rawQuery || '').trim();
  if (!query) return helpText();
  if (/^(帮助|help|菜单|hi|你好|您好|hello)$/i.test(query)) return helpText();

  const cleaned = cleanQuery(query);
  if (!cleaned && query.length <= 6) return helpText();

  // 部门直达：问的就是部门名（香港/仓库/内贸销售/自营平台/总务……），列出该部门全部对接人
  const dept = findDept(cleaned);
  if (dept) return deptListing(dept).text;

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

/** 结构化出口：网页版用，返回 { text, table }（部门直达时带表格数据） */
function answerRich(rawQuery) {
  const query = String(rawQuery || '').trim();
  if (!query) return { text: helpText(), table: null };
  if (/^(帮助|help|菜单|hi|你好|您好|hello)$/i.test(query)) return { text: helpText(), table: null };
  const cleaned = cleanQuery(query);
  const dept = findDept(cleaned);
  if (dept) return deptListing(dept);
  return { text: answer(rawQuery), table: null };
}

module.exports = { answer, answerRich, helpText };
