/**
 * test-match.js — 本地测试匹配逻辑
 * 用法：node test-match.js "报销被驳回了找谁"
 *      不带参数则跑内置用例集
 */
'use strict';
const { answer } = require('./matcher');

const CASES = [
  '报销被驳回了，找谁？',
  '这批货很急，要加急配货',
  '工资条没收到，也没看到工资到账',
  '下周要出差，帮我订票',
  '社保要停缴，找谁办？',
  '海外客户的订单要出库，报关怎么弄',
  '香港仓的货要加急出库',
  'ERP 系统用不了',
  '要给新供应商建编码',
  '合同要盖章',
  '我想报销打车费',
  '客户说要来仓库参观',
  '我要招聘一个新员工',
  '打印机坏了',
  '帮我查下花名册',
  '今天天气怎么样',
  '帮助',
];

const args = process.argv.slice(2);
if (args.length) {
  for (const q of args) {
    console.log('='.repeat(50));
    console.log('问：' + q);
    console.log('-'.repeat(50));
    console.log(answer(q));
    console.log();
  }
} else {
  for (const q of CASES) {
    console.log('='.repeat(50));
    console.log('问：' + q);
    console.log('-'.repeat(50));
    console.log(answer(q));
    console.log();
  }
}
