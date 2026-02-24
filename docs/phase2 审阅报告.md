# Phase 2 审阅报告

审阅时间：2026-02-24  
审阅范围：`finance-news-radar` Phase 2 增量（情绪指标、经济日历、市场摘要）

---

## 结论

Phase 2 已完成主要功能接入，但存在 2 个高优先级缺陷和 1 个中优先级一致性问题。建议先修复高优先级问题后再继续后续迭代开发。

---

## 问题清单（按严重级别）

### 1. 高危：经济日历未来日期漏采（核心逻辑缺陷）
- 位置：
  - `finance-news-radar/scripts/fetch_calendar.py:403`
  - `finance-news-radar/scripts/fetch_calendar.py:407`
  - `finance-news-radar/scripts/fetch_calendar.py:414`
- 问题说明：`week/month` 去重后，仅首个日期写入数据；同周/同月后续日期未复用原始结果并按日期分发。
- 影响：`economic-calendar.json` 常出现“只有当天有事件，未来几天空白”。
- 修复建议：重构为“按周/月请求一次，按 `date` 字段切分写回所有目标日期”。

### 2. 高危：前端存在 XSS 注入风险
- 位置：
  - `finance-news-radar/assets/app.js:341`
  - `finance-news-radar/assets/app.js:385`
  - `finance-news-radar/assets/app.js:389`
  - `finance-news-radar/assets/app.js:391`
- 问题说明：外部源/LLM 文本直接拼接到 `innerHTML`。
- 影响：恶意内容可注入脚本或破坏页面 DOM。
- 修复建议：默认使用 `textContent`；必须渲染 HTML 的场景统一做 escape/sanitize。

### 3. 中危：注释与实现不一致
- 位置：`finance-news-radar/scripts/fetch_calendar.py:7`
- 问题说明：注释声明有 Investing.com fallback，但代码未实现该分支。
- 影响：运维和排障时会误判兜底能力。
- 修复建议：二选一：
  - 实现 Investing fallback；
  - 或删除该声明并更新文档。

---

## 修复优先级

1. 修复 `fetch_calendar.py` 的多日期映射逻辑。  
2. 修复 `app.js` 的不安全渲染点。  
3. 同步注释与真实实现一致。  

---

## 测试缺口（需补）

1. 经济日历覆盖测试：验证“今天 + N 天”各日期均可正确落盘。  
2. 前端安全测试：`<script>`、`onerror`、HTML 标签注入场景。  
3. 前端回归测试：无数据/脏数据/接口失败时摘要与日历模块的降级行为。  

