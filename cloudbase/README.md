# 声迹：腾讯云免费体验环境

这一目录保存当前国内测试链接使用的前端和云函数源码，与根目录下的本地服务器版本独立。网页源码位于 `cloudbase/client`；需要更新测试链接时，请修改这里的网页源码并重新部署。

当前测试地址：

https://fresh-salamander-d5e3n8i7cbe7352-1532780264.ap-shanghai.app.tcloudbase.com/

首次打开时，访客需要阅读腾讯云提示并点击“确定访问”。这是测试域名，不能保证永久有效或所有网络都可访问。当前环境显示到期时间为 2027-05-15 23:59:59（北京时间），自动续费和超额付费均未开启；续期政策和额度以腾讯云控制台为准。

## 更新网页

在项目根目录安装依赖，安装并登录腾讯云 CloudBase CLI 后执行：

```powershell
npm install
tcb login
./cloudbase/update.ps1
```

脚本构建 `cloudbase/client` 并上传静态文件；原有云端记录不会被覆盖。若修改了 `cloudbase/functions/soundtrace-api` 中的后端，再执行：

```powershell
./cloudbase/update.ps1 -IncludeBackend
```

后端更新需要当前账号有读取和更新云函数配置的权限。脚本只在当前进程中暂存现有的服务端密钥，不将密钥写入仓库。若需要自行部署到其他环境，应同时修改环境 ID、路由和 `router.mjs` 中的静态资源地址，并重新配置服务端密钥。

仓库推送不会自动更新腾讯云测试地址；需要执行更新脚本，或另外配置自动部署。免费体验环境提供有限资源点，超出额度后可能暂停服务，重要数据应另行备份。

## 数据说明

新环境与此前的 EdgeOne、其他云端版本各自存储数据，旧环境记录和浏览器“本机记录”不会自动迁移。地图上的记录对访客共享，当前版本允许访客修改或删除地图节点；“本机记录”仅保存在当前浏览器和网址。

本地验证：`node --test cloudbase/tests/*.test.mjs`。部署后可设置 `SOUNDTRACE_TEST_ORIGIN` 并运行 `node --use-env-proxy cloudbase/tests/live-cloudbase.mjs`；该脚本会创建并删除自己的测试记录。
