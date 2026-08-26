# 06 · BGM 选曲候选（M4）

> 状态：**候选清单就绪，待你试听定曲**。
> 音频系统已做完整：把选定的曲目放进 `public/media/audio/bgm-1.mp3`（或 `.ogg`），
> 应用会自动探测、首次点击音乐钮时懒加载并 0.8s 淡入——**不影响首屏性能预算**
> （探测仅一次 HEAD 请求，音频本体零预载）。

## 选曲原则（02 设计文档 §6）
- 场景基调：汴河晨市，人间烟火，**不悲不喜、疏朗从容**
- 乐器优先：古琴/箫/笛/琵琶拨弦 + 轻打击；忌电子音、忌唢呐高亢
- 节奏：60–90 BPM 慢板；可无缝循环（首尾 2s 交叉淡入淡出容忍度内）
- 体积：≤ 4MB（192kbps MP3、3 分钟以内）；首屏零加载

## 候选（按推荐序）

| # | 曲目 | 来源 | 授权 | 链接 |
|---|------|------|------|------|
| 1 | China · Chinese · Asian Music（古琴+弦乐，叙事感强） | Pixabay | Pixabay License（免费商用、无需署名、可改） | https://pixabay.com/music/adventure-china-chinese-asian-music-349489/ |
| 2 ✅ **已选定** | Chinese Traditional Tune（传统调性，清淡） | Pixabay | 同上 | https://pixabay.com/zh/music/china-chinese-traditional-tune-12312/ |
| 3 | China Traditional Cinematic Music（电影感铺底） | Pixabay | 同上 | https://pixabay.com/music/china-china-traditional-cinematic-music-347249/ |
| 4 | 小鎮月光（月色小调，偏静） | 500Audio | 站免费曲（下载页逐条核对授权） | https://zh.500audio.com/track/small-town-moonlight_1067910 |
| 5 | CC 配乐分类（古琴/箫类多） | aigei | CC 协议（下载页注明具体 CC 版本） | https://www.aigei.com/music/cc/world_4/ |
| 6 | 公共领域演奏（古典公版） | FreePD | 公有领域（无版权） | https://freepd.com/ |

> 说明：Pixabay License 对「音乐库」明确允许商用、无需署名、允许修改，
> 是五份文档里「免费商用 + 留档」要求下最省心的一档；
> 仍按规范把**下载页快照**存到 `docs/audio-license/`。

## 定曲后动作（我来做）
1. 文件落位 `public/media/audio/bgm-1.mp3`（>4MB 我会转码到 192kbps）
2. `docs/audio-license/` 存：下载页 URL + 授权条款截图/文本 + 下载日期
3. `01-需求文档.md` F5 勾选「已接入」，音乐钮状态由占位转实
4. 首屏体积复测（确认 BGM 不进入首屏关键资源）

## 本环境限制备注
开发环境外网对 Pixabay/500Audio 等站点有反爬或网络限制，
无法由我直接代下；请你在本机浏览器打开上表链接试听，
选中后把 MP3 丢进 `public/media/audio/` 或发我即可。
