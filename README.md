# 海大跑步工坊

在浏览器中自定义上海海洋大学校园路线、时间、距离、配速与模拟运动指标，下载 FIT / TCX。生成与保存均在当前浏览器中完成，不需要服务器、API 密钥或 ChatGPT 登录。

## 发布到 GitHub Pages

1. 使用状态正常的 GitHub 账号创建公开仓库，例如 `shou-run-studio`。
2. 将本发布包解压后的全部文件上传到仓库 `main` 分支根目录。确保 `index.html` 与 `assets/`、`vendor/` 等目录直接位于仓库根目录，不要再套一层文件夹。保留 `.nojekyll` 文件。
3. 打开仓库 **Settings → Pages**，Source 选择 **Deploy from a branch**，Branch 选择 **main**，目录选择 **/(root)**，点击 **Save**。
4. 等待 GitHub Pages 部署完成，使用 Pages 页面显示的最终网址。一般形式为 `https://你的用户名.github.io/shou-run-studio/`，以 GitHub 实际返回为准。

官方说明：https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

本发布包使用相对资源路径，支持 GitHub Pages 项目子目录。无需构建或安装依赖。所有静态资源均随包提供；只有可选在线底图需要外部地图服务。

## 数据与导入

本工具生成模拟测试数据，导出文件保留模拟来源标注。心率、步频、功率和热量均为模型值，不代表实际测量。第三方 App 支持哪些字段、如何显示活动名称或来源标签，由该 App 决定。

方案仅保存在当前浏览器，可导出 JSON 迁移。不同网址之间的浏览器存储互不共享：从旧站迁移时，先在旧站备份 JSON，再在新站导入。

发布包不包含个人导出记录、浏览器保存方案、Git 历史或站点授权信息。校园位置用于默认示意路线，非现场测绘结果。

## 第三方组件

- Leaflet，许可证：`assets/LEAFLET_LICENSE.txt`。
- Garmin FIT SDK 21.218.0，许可证：`vendor/fitsdk/LICENSE.txt`。SDK 文件保留原样，应用在编码后修正协议版本字节并重新计算 CRC。
