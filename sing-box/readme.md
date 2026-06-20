# 🔗 Sub Store 脚本&参数
> **使用方法**：将下方带参数链接直接填入sub store 脚本远程地址栏
---

## 1. 🛡️ 配置文件多端适配

> **核心机制**：根据指定的参数(平台类型)自动适配 `inbounds` 字段

### 💻 电脑 / 安卓 (普通模式)
**适配逻辑**：自动移除 `tproxy`，关闭自动重定向，保留 `platform` 代理设置。

```
https://v6.gh-proxy.org/https://raw.githubusercontent.com/ljrgov/conf/refs/heads/main/sing-box/cfg_for_sub_store.js#device=win&mirror=https://v6.gh-proxy.org/&download_detour=direct&secret=***&url=订阅链接
```

### 📱 安卓 (Root 模式)
**适配逻辑**：保留 `tproxy`，开启 `tun` 自动重定向，自动移除 `platform`。

```
https://v6.gh-proxy.org/https://raw.githubusercontent.com/ljrgov/conf/refs/heads/main/sing-box/cfg_for_sub_store.js#device=root&port=7890&listen=::&output=/data/adb/box/run/sing-box.log&mirror=https://v6.gh-proxy.org/&download_detour=direct&external_ui=dashboard&secret=***&url=订阅链接
```

### 🖥️ 服务端 (Linux / Server)
**适配逻辑**：最精简配置。保留 `tproxy`，自动移除 `platform` 及所有 Android 专属字段（如 UID/包名过滤）。

```
https://v6.gh-proxy.org/https://raw.githubusercontent.com/ljrgov/conf/refs/heads/main/sing-box/cfg_for_sub_store.js#device=server&port=7890&listen=::&output=sing-box.log&mirror=https://v6.gh-proxy.org/&download_detour=direct&secret=***&url=订阅链接
```

---

## 2. 📦 订阅节点导入配置

> **注意**：推荐用于 sing-box 官方内核配置！

### sub store参数拼接链接(已添加镜像)

```
https://v6.gh-proxy.org/https://raw.githubusercontent.com/xream/scripts/main/surge/modules/sub-store-scripts/sing-box/template.js#type=组合订阅&name=subs&outbound=🕳ℹ️📦 手动选择🕳ℹ️⚡ 自动选择🕳ℹ️🎮 Game🏷ℹ️^(?:(?!mi|lg).)*(🇯🇵|🇨🇳|🇹🇼).*$🕳ℹ️🇭🇰 HK🏷ℹ️^(?:(?!游戏|bv).)*(港|hk|hong|🇭🇰).*$🕳ℹ️🇨🇳 TW🏷ℹ️^(?:(?!游戏|dj).)*(台|tw|taiwan|🇨🇳|🇹🇼).*$🕳ℹ️🇯🇵 JP🏷ℹ️^(?:(?!游戏|bv).)*(日本|jp|japan|🇯🇵).*$🕳ℹ️🇺🇸 US🏷ℹ️^(?:(?!游戏|lg|dj).)*(美|us|united|🇺🇸).*$🕳ℹ️🇸🇬 SG🏷ℹ️^(?:(?!us|游戏|bv).)*(新|sg|sing|🇸🇬).*$

```

**脚本地址(作者)**

```
https://raw.githubusercontent.com/xream/scripts/main/surge/modules/sub-store-scripts/sing-box/template.js
```

---

## 3. 💡 使用须知

- **大小写不敏感**：`device=ROOT` 和 `device=root` 效果完全相同。
- **物理安全**：脚本在内存中完成对象转换，输出的 JSON 格式永远合法，不受原模板顺序影响。
- **参数叠加**：所有参数均可无限叠加，未定义的参数将保持原 `config.json` 默认值。
- **节点导入**：参数名称须与配置中出站字段type名称保持一致。
