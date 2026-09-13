# 资产来源、缓存与有界下载

正常运行本包不需要本节的任何下载。人物 GLB、贴图、烘焙动作、六份 BVH 和引擎均已本地缓存。

## 现有缓存

| 文件 | 字节 | SHA-256 |
|---|---:|---|
| `assets/characters/rain.glb` | 3564248 | `0bdedb1f9823c549eb97a8a0c8580688e45dd7894fbcc237bba9e989d9b458a6` |
| `assets/characters/snow.glb` | 2344240 | `de5814f91a255fc913bc9ca5be0a1e2b5952226c92961688293dc66674ed0e77` |

六份原始 BVH 的逐文件 hash/帧数见 `artifacts/recovery-static.json`。源与运行时片段分开保存，不要重新下载后覆盖原始记录。

## 可选：原始 Blender 源包

源包不在本交付 ZIP 中。以下链接与 SHA 来自已保存的先前下载 receipt；本轮没有重新下载大文件验证链接活性。链接失效时访问对应官方角色页，不在正常启动中自动重试。

| 人物 | 官方页面 | 已记录源包 | 已记录 SHA-256 |
|---|---|---|---|
| rain | https://studio.blender.org/characters/rain/v3/ | https://studio.blender.org/download-source/files/ee/a7/eea73e55dba1cea31c09848df6a794b2-4.zip | `80217f163f6392dc829233d63c2cfb5e1376775bc34101ad14f39631fea70d24` |
| snow | https://studio.blender.org/characters/snow/v4/ | https://studio.blender.org/download-source/files/ba/0f/ba0fe6d810333b1d73c1c359e4dc03cb-6.zip | `98d58ef3a07083ede14140bc462cccb55d317062846aa0eb652d2e4a7ac422a6` |

## Windows 有界下载示例（可选）

先建 `asset-audit` 目录。只下载缺少的那一个，不把下载和构建/测试串成一个命令；失败记录并转入其他工作。

```powershell
New-Item -ItemType Directory -Force asset-audit | Out-Null
node tools/run-bounded.mjs 260000 curl.exe --fail --location --connect-timeout 10 --max-time 120 --retry 1 --retry-delay 2 --output asset-audit/rain.zip "https://studio.blender.org/download-source/files/ee/a7/eea73e55dba1cea31c09848df6a794b2-4.zip"
Get-FileHash -Algorithm SHA256 asset-audit/rain.zip
```

校验一致后再解压。macOS/Linux 将 `curl.exe` 换为 `curl`。此命令只作下载方法文档，本轮未对远端源包执行。不要把不匹配的期望值改成实际坏文件 hash；保留 `.part`、响应类型、字节数、退出码作为诊断。

原始动作仓库：https://github.com/jdpulgarin/Tennis-MoCap
本游戏此前固定源 revision：`9af88bb4df4e78b22127719744fdca993ced2733`。
对应路径：`data/<BVH文件名>`。完整文件列表可从本地 `assets-source/full/` 取得，不需要递归拉全库。

素材可用性与来源记录保留在 About / licenses 文档，不在主游戏界面新增任何版权浮层。
