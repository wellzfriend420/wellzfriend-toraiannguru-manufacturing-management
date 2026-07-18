import test from 'node:test';import assert from 'node:assert/strict';
import { grossProfit, laborRate, periodRange, workMinutes, yieldRate } from '../src/domain.js';
test('工程・人別歩留まりは加工後÷投入',()=>{assert.equal(yieldRate(80,100),.8);assert.equal(yieldRate(0,0),null);});
test('月給者管理単価は月給÷平日日数÷8',()=>{assert.equal(laborRate({rateType:'monthly_management',salaryAmount:352000,weekdayCount:22,hoursPerDay:8}),2000);});
test('作業時間は休憩を控除',()=>{assert.equal(workMinutes('2026-07-19T00:00:00Z','2026-07-19T02:00:00Z',15),105);});
test('粗利と粗利率',()=>{assert.deepEqual(grossProfit(100000,40000),{amount:60000,rate:.6});});
test('月次期間',()=>{assert.deepEqual(periodRange('month','2026-07-19'),{from:'2026-07-01',to:'2026-07-31'});});
