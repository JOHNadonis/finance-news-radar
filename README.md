# Finance News Radar — 24 小时金融信息雷达

自动聚合全球金融快讯、深度文章、加密货币动态，每 15 分钟更新一次，通过静态页面展示，零成本运行在 GitHub Pages 上。

## 覆盖范围

| 市场 | 数据源 |
|------|--------|
| A 股 | 华尔街见闻、财联社、东方财富 |
| 港股 | 华尔街见闻、格隆汇 |
| 美股 | 华尔街见闻、CNBC、MarketWatch、Seeking Alpha |
| 宏观 | 金十数据、Reuters、FT、WSJ |
| 加密货币 | 律动 BlockBeats、CoinDesk、The Block、Decrypt |
| 大宗商品 | Reuters、Bloomberg |
| 外汇 | 金十数据 |

**总计**：6 个内置 API 采集器 + 26 条 RSS 订阅 = 32 个数据源入口

## 架构

```
Python 采集脚本 → JSON 数据文件 → 静态前端 → GitHub Actions (每 15 分钟)
```

## 本地运行

```bash
# 安装依赖
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 运行采集
python scripts/update_finance.py --output-dir data --window-hours 24 --rss-opml feeds/finance.opml

# 本地预览
python -m http.server 8000
# 打开 http://localhost:8000
```

## 部署

项目通过 GitHub Actions 自动运行，每 15 分钟采集一次，结果通过 GitHub Pages 展示。

### 配置步骤

1. Fork 本仓库
2. 启用 GitHub Pages（Settings → Pages → Source: main branch）
3. （可选）设置 `FINANCE_OPML_B64` secret 来自定义 RSS 源

## 数据源

### 内置采集器（6 个）

| 源 | 类型 | 内容 |
|----|------|------|
| 华尔街见闻 | REST API | 7x24 快讯（全球 / 美股 / A 股） |
| 金十数据 | JSON API | 全球宏观快讯 |
| 律动 BlockBeats | Open API | 加密货币快讯 |
| 财联社 | JSON API | A 股电报快讯 |
| 东方财富 | JSON API | 综合财经新闻 |
| 格隆汇 | JSON API | 港美股快讯 |

### RSS 订阅（26 条）

详见 `feeds/finance.opml`，涵盖 Reuters、CNBC、MarketWatch、Bloomberg、FT、WSJ、CoinDesk、The Block 等英文源。

## 功能特性

- **市场分类**：A 股 / 美股 / 港股 / 宏观 / 加密 / 大宗 / 外汇
- **双语标题**：英文标题自动翻译为中文
- **金融过滤**：从综合源中精准筛选金融内容
- **去重**：标题 + URL 级去重
- **45 天归档**：历史数据保留
- **深色主题**：金融风格 UI

## 技术栈

- **采集**：Python 3.11 + requests + feedparser + BeautifulSoup
- **前端**：原生 HTML/CSS/JS（零框架依赖）
- **自动化**：GitHub Actions
- **部署**：GitHub Pages（零成本）

## 项目结构

```
finance-news-radar/
├── scripts/
│   └── update_finance.py    # 核心采集脚本
├── assets/
│   ├── app.js               # 前端交互
│   └── styles.css            # 金融主题样式
├── feeds/
│   └── finance.opml          # RSS 订阅源
├── data/                     # 输出数据（自动生成）
│   ├── latest-24h.json       # 24 小时快照
│   ├── archive.json          # 45 天归档
│   ├── source-status.json    # 数据源状态
│   └── title-zh-cache.json   # 翻译缓存
├── .github/workflows/
│   └── update-finance.yml    # CI 自动化
├── index.html                # 静态首页
├── requirements.txt          # Python 依赖
└── README.md                 # 本文件
```

## 致谢

基于 [ai-news-radar](https://github.com/LearnPrompt/ai-news-radar) 架构改造。
