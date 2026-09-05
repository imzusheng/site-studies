# Luma Remote A3.44 宣传网站

Blender 产品短片与海报、自然滚动的产品介绍、一个局部 Three.js 结构展示。首页与视频无需等待模型加载。A3.44 的 450 个原始对象与 11 个可打印部件保留在模型清单中；重复的供应商实体仅在展示层去重。

## 启动

需要 Node.js 22.12+ 和 npm。从仓库根目录运行：

```bash
cd animejs
npm ci
npm run dev
```

打开终端输出的地址，默认 http://localhost:5173/。浏览器播放已提交的 MP4，不需要安装 Blender。

生产构建及本地预览：

```bash
npm run validate
npm run build
npm run preview -- --host 0.0.0.0
```

预览默认 http://localhost:4173/。部署 `animejs/dist/` 到静态服务器根路径即可；本项目资源 URL 使用 `/videos/`、`/models/` 等绝对路径。

页面共 17 个内容章节，保留滚动爆炸线稿和 Blender 实景短片。首屏沿用已认可的历史渲染。

## 页面与素材

- `index.html` / `css/style.css`：产品叙事、排版、基础移动端适配。
- `js/promo-page.js`：首屏 sticky 缩窗过渡、视频按可见性播放、暂停及重播。
- `js/main.js`：结构段附近才加载三维模型。
- `js/film-engine.js` / `js/explosion-space.js`：全程线稿、黑白反差转换与刚性功能组件的分离路线。
- `public/videos/`：首屏、三色同框、内部支撑、内部微距、ESP32-S3、Choc V2 短片。
- `public/images/`：视频封面和可打印部件海报。
- `blender/`：可独立重渲染的工程、参数、建景与编码脚本，见其中 README。

## 验证边界

`npm run validate` 验证 A3.44 模型文件完整性、页面资源、运动数值和精确复位；它不替代浏览器的构图、闪烁与碰撞检查。渲染素材是产品设计展示，不是实拍或制造验收证据。
