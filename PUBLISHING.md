# 开源发布清单（dsh-leike-pet）

这份文件不进 npm 包，是给你自己的发布笔记。按顺序做即可。

> 为什么叫 `dsh-leike-pet`：npm 上的 `dsh-desktop-pet` 已被别人占用，GitHub 上也有 4 个
> 同名仓库。`dsh-leike-pet` 在 npm 与 GitHub 上都还空着（已核对）。
>
> 本机没有装 `gh` CLI；下面给的是「网页 + 本地 git」的路线。

## 0. 已确认的信息

| 项 | 值 |
| --- | --- |
| GitHub 用户名 | `Zyr147258`（ID 343853468，2026-10-17 创建） |
| 目标仓库 | `https://github.com/Zyr147258/dsh-leike-pet`（**已创建，空仓库**，main 分支） |
| npm 包名 | `dsh-leike-pet`（registry 404，可用） |
| 作者署名 | `Zyr147258` |
| 提交邮箱 | `343853468+Zyr147258@users.noreply.github.com` |

`package.json`、`README.md`、`LICENSE`、`community/Zyr147258__dsh-leike-pet.yml` 已全部填好；
本地已经有一次提交（作者 `Zyr147258`），`git status` 是干净的。
想改用真名：改 `package.json` 的 `author` 与 `LICENSE` 的 `Copyright (c) 2026 ...` 两处，
再 `git commit --amend --reset-author`。

> ⚠️ 之前清单里写的 `zyr147` 是**另一个人的账号**（ZhangYanran，2024 年创建），不是你的。
> 所有文件都已改成 `Zyr147258`，也从未向 `zyr147` 推送过任何东西。

## 1. 关联远程并推送

仓库已经建好（空仓库），只差推送。在本目录（`dsh-leike-pet/`）执行：

```sh
git remote add origin https://github.com/Zyr147258/dsh-leike-pet.git
git push -u origin main
```

首次推送会弹 Git Credential Manager 的浏览器授权。**确认登录的是 `Zyr147258`**；
如果它自动选了别的账号，点 “Use a different account”，或在 Windows「凭据管理器 →
Windows 凭据」里删掉旧的 `git:https://github.com` 条目再重试。

推送完打开仓库 **About**（右上角齿轮），在 Topics 里加 `dsh-plugin`
（列表 CI 会检查；再加 `deepseek-harness`、`desktop-pet`、`pixel-art` 也行）。

## 2. 验证“能从 GitHub 装”

换一台机器或新 profile 试一次，确认没有本地残留也能装：

```sh
dsh plugin --profile web add github:Zyr147258/dsh-leike-pet
dsh --profile web --dump-config | findstr leike
```

插件没有构建步骤、没有依赖，pnpm 拉下来即可用；装完重启 `dsh web`，F5 就能看到蕾克。

## 3. 发 npm（可选，但推荐）

列表不要求 npm，但从 npm 安装会跳过源码构建，体验更好，市场也能显示下载量。

```sh
npm login                       # 需要 npm 账号，会打开浏览器
npm publish --access public     # 包名 dsh-leike-pet
```

发布前确认：

- `package.json` 的 `name` 是 `dsh-leike-pet`，`version` 是 `0.2.0`；
- `repository` 指向 `https://github.com/Zyr147258/dsh-leike-pet`（否则 npm 与列表不会关联）；
- 包里只带 `lib/`、`assets/`、`icon.png`、`cordis.patch.yml`、`README.md`、`LICENSE`
  （`files` 已配好，`preview/`、`tools/` 不会进包）。

## 4. 提交到 awesome-dsh-plugin

社区列表是 <https://github.com/awesome-dsh-plugin/awesome-dsh-plugin>，
不是 dsh-market 仓库本身。**一个 PR 只加一个文件**，不要手改 README（README 由脚本生成）。

### 网页操作（不需要 gh）

1. 打开 <https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/fork>，fork 到自己账号；
2. 在自己 fork 里新建文件 `data/plugins/Zyr147258__dsh-leike-pet.yml`
   （路径照抄，文件名必须是 `owner__repo.yml`）；
3. 内容直接复制 `community/Zyr147258__dsh-leike-pet.yml`；
4. 提交时选 **Create a new branch for this commit and start a pull request**，
   分支名 `add-dsh-leike-pet`，然后开 PR，标题 `Add dsh-leike-pet`。

### 命令行（装了 gh 也可以用）

```sh
gh repo fork awesome-dsh-plugin/awesome-dsh-plugin --clone
cd awesome-dsh-plugin
cp <本仓库路径>/community/Zyr147258__dsh-leike-pet.yml data/plugins/Zyr147258__dsh-leike-pet.yml
git checkout -b add-dsh-leike-pet
git add data/plugins
git commit -m "Add dsh-leike-pet"
git push -u origin add-dsh-leike-pet
gh pr create --title "Add dsh-leike-pet" --body "Pixel-art Little Red Riding Hood pet for the DSH session window."
```

条目字段（已在文件里填好）：

```yaml
url: https://github.com/Zyr147258/dsh-leike-pet
name: Zyr147258/dsh-leike-pet
category: fun
description:
  en: '...'   # 含冒号，已用引号包住
  zh: '...'
```

**时间线**：仓库必须创建满 1 天，CI 才会通过；合并后站点与 dsh-market 通常一天内收录。
被要求改描述很常见，改完在自己分支上再 push 即可，不用重开 PR。

## 5. 收录后

- 在 dsh-market 里应该能搜到 `dsh-leike-pet`，直接点安装；
- 截图来自仓库根目录的 `screenshots.json`（已配好，指向 `preview/shots/*.png`），
  以后换图只推自己的仓库即可，不用再提 PR；
- 想改描述：只改自己那条 YAML 再 PR，不要动别人的条目。

## 附：本地验证（不需要联网）

```sh
node --check lib/index.js lib/pet.js
py tools/build_sprites.py            # 重新生成精灵帧（需要 Pillow）
# 打开 preview/index.html 看效果，或加 ?selftest=1 跑交互自测
```
