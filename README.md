# 清明上河图 · 众生图鉴（H5）

> 展卷、点将、观天下 —— 基于《清明上河图》虹桥段的互动角色图鉴。
> 长卷自由平移/缩放/惯性，点击任意人物查看背景与关系，图谱模式纵览 31 位角色的社交网络。

## 在线访问

部署于 Vercel（项目 `lextellsyou/dsh-wui-qmsht-wz`），构建命令 `npm run build`，产物目录 `dist/`。

## 本地运行

```bash
npm install
npm run build:images   # 仅当需要重新切图（依赖 assets/清明上河图.jpg）
npm run dev            # http://localhost:5173
```

生产构建 `npm run build`（prebuild 自动执行数据校验 + 标定页数据同步）。

## 技术栈

Vue 3 + TypeScript + Vite 6 · Pinia · GSAP（开场/镜头）· d3-force（图谱布局）· sharp（构建期三档切图）

## 目录

| 路径 | 说明 |
|------|------|
| `src/core/` | CameraRig / PanZoom / 三档图层调度 |
| `src/views/` | 展卷 / 图谱 / 详情 / 世界书 |
| `src/data/` | 31 角色 + 38 关系边 + 世界观（单一数据源） |
| `scripts/` | 切图 / 数据校验 / 冒烟测试（`smoke.mjs`）/ 立绘接入 |
| `public/media/` | 发布资源：三档长卷切图 / 31 张立绘 / BGM |
| `docs/` | 需求 / 设计 / 技术栈 / 开发 / 世界观 / BGM 选曲 六份文档 + 授权留档 |

## 性能（Lighthouse 移动 4G 模拟）

Performance 94 · LCP 2.9s · TBT 0ms · 总传输 336KiB（详见 `docs/04-开发文档.md` 验收记录）
