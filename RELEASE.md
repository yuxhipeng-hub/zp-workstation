# ZP Workbench 发布与更新

## 更新架构

启动器使用“静态更新清单 + GitHub API + 多下载线路”的组合，不依赖单一
GitHub 地址：

1. 客户端并行检查 GitHub Release 中的 `latest.json`、国内加速清单、
   GitHub Latest API 和国内 GitHub API 加速。
2. 所有可用线路返回结果后，选择版本号最高的 Release。
3. 下载安装包时依次尝试 GitHub 直连、`gh-proxy.com` 和更新清单中配置的其他线路。
4. 下载完成后校验 SHA-256；校验失败会删除临时文件并切换下一线路。
5. 只有校验通过的安装包才会交给 Windows 安装向导。

因此，用户不开启 VPN 时通常仍能检查更新和下载，前提是至少一条国内加速线路可用，
并且发布中包含 `latest.json`。如果 GitHub、公共加速站和自有 CDN 同时不可用，
任何客户端都无法凭空获得新版本。

## 自动发布

仓库已经包含 `.github/workflows/release.yml`。发布新版本时只需要：

```powershell
npm version 0.3.1 --no-git-tag-version
npm test
git add package.json package-lock.json
git commit -m "release: ZP Workbench 0.3.1"
git tag v0.3.1
git push origin v3
git push origin v0.3.1
```

Tag 推送到 GitHub 后，工作流会自动：

1. 将构建版本对齐为 `0.3.1`。
2. 执行全部测试。
3. 下载并校验内置的 Node.js 与 npm 运行时。
4. 生成 `ZP-Workbench-Setup-0.3.1-x64.exe`。
5. 生成 `latest.json` 和安装包 `.sha256` 文件。
6. 创建 GitHub Release，并上传安装包、blockmap、校验文件和更新清单。

工作流使用 GitHub 自动提供的 `GITHUB_TOKEN`，不需要额外创建发布密钥。
GitHub 仓库需要在 `Settings → Actions → General → Workflow permissions`
中允许 `Read and write permissions`。工作流文件本身已声明 `contents: write`。

`bundledRuntime` 固定内置 Node.js 和 npm 版本。`npm run dist` 会先运行
`scripts/prepare-vendor.ps1`，确保安装包始终包含用户首次安装 DSH 所需的运行时，
即使 `vendor/` 没有提交到 Git 也不会生成缺少运行时的安装包。

也可以在 GitHub Actions 页面手动运行 `Release ZP Workbench`，填写版本号和更新说明。

## 发布文件

每次 Release 必须包含：

```text
ZP-Workbench-Setup-${version}-x64.exe
ZP-Workbench-Setup-${version}-x64.exe.blockmap
ZP-Workbench-Setup-${version}-x64.exe.sha256
latest.json
```

其中 `${version}` 是不带 `v` 的版本号。`latest.json` 是客户端的新版本清单：

```json
{
  "version": "0.3.1",
  "tag": "v0.3.1",
  "name": "ZP Workbench 0.3.1",
  "notes": "本次更新说明",
  "assets": [
    {
      "name": "ZP-Workbench-Setup-0.3.1-x64.exe",
      "size": 172000000,
      "sha256": "安装包 SHA-256",
      "urls": [
        {
          "id": "github-direct",
          "label": "GitHub 直连",
          "url": "https://github.com/.../ZP-Workbench-Setup-0.3.1-x64.exe"
        }
      ]
    }
  ]
}
```

本地需要手动生成清单时运行：

```powershell
npm run manifest -- --version 0.3.1 --notes "修复课表编辑和更新线路" --output release/latest.json
```

## 无 VPN 的线路

当前默认线路：

- GitHub 更新清单：`github.com/.../releases/latest/download/latest.json`
- 国内加速清单：`gh-proxy.com/https://github.com/.../latest.json`
- GitHub API 直连：`api.github.com/.../releases/latest`
- 国内 GitHub API 加速：`gh-proxy.com/https://api.github.com/...`
- 安装包直连与国内下载加速

`gh-proxy.com` 是第三方公共服务，适合作为过渡和备用线路，不适合作为长期唯一依赖。
公共代理可能限速、临时失效或调整规则，因此客户端不应把某一条代理写死为唯一来源。

## 自有 CDN

正式长期发布建议把 `latest.json` 和安装包镜像到自有对象存储或 CDN，例如阿里云 OSS、
腾讯云 COS、Cloudflare R2 等。上传后，在 `package.json` 的
`launcherRelease.manifestUrls` 中加入静态清单地址：

```json
{
  "id": "zp-cdn",
  "label": "ZP 官方 CDN",
  "url": "https://download.example.com/zp-workbench/latest.json"
}
```

清单内的 `assets[].urls` 可以加入 CDN 下载地址。这样即使 GitHub 和公共加速站都不通，
客户端仍可通过自有 CDN 检查、下载和校验更新。

自有 CDN 地址确定后需要随启动器版本一起发布，客户端才会读取新的清单地址。将来接入
CDN 不需要更换更新协议，只需追加 `manifestUrls`，已有客户端仍会继续使用 GitHub 和
已配置的加速线路。

## 安全说明

- 安装包必须启用 SHA-256 校验，缺少校验值时应记录警告并避免静默升级。
- 公共代理可能修改传输内容，因此不能把代理设置为唯一信任源。
- 正式 CDN 建议使用 HTTPS，并保留 GitHub Release 作为灾备。
- 更高安全等级可以为 `latest.json` 增加 Ed25519 签名，把公钥嵌入客户端，私钥放在
  GitHub Secrets；当前版本先完成多线路、校验和回退，不引入密钥轮换复杂度。

## 验证

发布前至少验证：

```powershell
npm test
npm run build:renderer
npm run dist
```

发布后使用旧版本设备验证“检查更新 → 查看线路 → 下载 → SHA-256 校验 → 打开安装向导”。
如果本机没有 VPN，应单独确认国内清单、GitHub API 加速和下载加速至少有一条可用。
