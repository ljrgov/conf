// https://git.repcz.link/raw.githubusercontent.com/ljrgov/conf/refs/heads/main/singbox/substore~rule-for-singbox.js#type=组合订阅&name=sublink&outbound=🕳ℹ️🇭🇰 游戏节点🏷ℹ️^.*🇭🇰.*游戏.*$🕳ℹ️🇯🇵 游戏节点🏷ℹ️^.*🇯🇵.*游戏.*$🕳ℹ️🇭🇰 香港节点🏷ℹ️^(?=.*(?:🇭🇰|香港|HK|Hong Kong))(?!(?:.*Premium|.*游戏|.*tg)).*$🕳ℹ️🇨🇳 台湾节点🏷ℹ️^(?=.*(?:🇨🇳|🇹🇼|台湾|TW|Taiwan))(?!(?:.*Premium|.*游戏|.*tg)).*$🕳ℹ️🇯🇵 日本节点🏷ℹ️^(?=.*(?:🇯🇵|日本|JP|Tokyo|Japan))(?!(?:.*Premium|.*游戏|.*tg)).*$🕳ℹ️🇺🇸 美国节点🏷ℹ️^(?=.*(?:🇺🇸|US|United States))(?!(?:.*Premium|.*游戏|.*nx)).*$🕳ℹ️🇸🇬 新加坡节点🏷ℹ️^(?=.*(?:🇸🇬|新加坡|SG|Singapore))(?!(?:.*Premium|.*游戏|.*tg)).*$🕳ℹ️🏰 欧洲区域🏷ℹ️^(?=.*(?:🇬🇧|🇫🇷|🇩🇪|🇮🇹|🇪🇸|🇵🇹|🇳🇱|🇸🇪|🇳🇴|🇫🇮|🇩🇰|🇨🇭|🇧🇪|🇵🇱|🇨🇿|🇷🇴|🇺🇦|🇬🇷|🇷🇺|🇪🇺))(?!(?:.*Premium|.*游戏|.*tg)).*$🕳ℹ️🦅 美洲区域🏷ℹ️^(?=.*(?:🇨🇦|🇲🇽|🇧🇷|🇦🇷|🇨🇴|🇵🇪|🇨🇱|🇺🇾|🇻🇪|🇪🇨|🇵🇾|🇬🇹|🇩🇴|🇨🇺|🇧🇴|🇭🇳|🇳🇮|🇯🇲))(?!(?:.*Premium|.*游戏|.*tg)).*$🕳ℹ️🐉 亚洲区域🏷ℹ️^(?=.*(?:🇰🇷|🇻🇳|🇹🇭|🇮🇳|🇵🇰|🇲🇾|🇮🇩|🇸🇦|🇮🇷|🇹🇷|🇵🇭|🇰🇵|🇱🇰|🇰🇿|🇦🇿|🇲🇴|🇷🇺))(?!(?:.*Premium|.*游戏|.*tg)).*$🕳ℹ️🪘 非洲区域🏷ℹ️^(?=.*(?:🇪🇬|🇿🇦|🇳🇬|🇰🇪|🇪🇹|🇬🇭|🇲🇦|🇹🇿|🇺🇬|🇩🇿|🇸🇳|🇨🇮|🇲🇱|🇨🇲|🇹🇳|🇲🇿|🇿🇼|🇦🇴|🇸🇩))(?!(?:.*Premium|.*游戏|.*tg)).*$🕳ℹ️🔍 手动选择🏷ℹ️^(?!.*(?:🇭🇰|🇨🇳|🇹🇼|🇯🇵|🇺🇸|🇸🇬|港|台湾|日本|美国|新加坡|HK|CN|TW|JP|US|SG|Hong|Taiwan|Tokyo|Japan|Singapore|United States)).*$


// 示例说明

// https://raw.githubusercontent.com/xream/scripts/main/surge/modules/sub-store-scripts/sing-box/template.js#type=组合订阅&name=机场&outbound=🕳ℹ️all|all-auto🕳ℹ️hk|hk-auto🏷ℹ️港|hk|hongkong|kong kong|🇭🇰🕳ℹ️tw|tw-auto🏷ℹ️台|tw|taiwan|🇹🇼🕳ℹ️jp|jp-auto🏷ℹ️日本|jp|japan|🇯🇵🕳ℹ️sg|sg-auto🏷ℹ️^(?!.*(?:us)).*(新|sg|singapore|🇸🇬)🕳ℹ️us|us-auto🏷ℹ️美|us|unitedstates|united states|🇺🇸

// 示例说明
// 读取 名称为 "机场" 的 组合订阅 中的节点(单订阅不需要设置 type 参数)
// 把 所有节点插入匹配 /all|all-auto/i 的 outbound 中(跟在 🕳 后面, ℹ️ 表示忽略大小写, 不筛选节点不需要给 🏷 )
// 把匹配 /港|hk|hongkong|kong kong|🇭🇰/i  (跟在 🏷 后面, ℹ️ 表示忽略大小写) 的节点插入匹配 /hk|hk-auto/i 的 outbound 中
// ...
// 可选参数: includeUnsupportedProxy 包含官方/商店版不支持的协议 SSR. 用法: `&includeUnsupportedProxy=true`

// 支持传入订阅 URL. 参数为 url. 记得 url 需要 encodeURIComponent.
// 例如: http://a.com?token=123 应使用 url=http%3A%2F%2Fa.com%3Ftoken%3D123

// ⚠️ 如果 outbounds 为空, 自动创建 COMPATIBLE(direct) 并插入 防止报错
log(`🚀 开始`)

let { type, name, outbound, includeUnsupportedProxy, url } = $arguments

log(`传入参数 type: ${type}, name: ${name}, outbound: ${outbound}`)

type = /^1$|col|组合/i.test(type) ? 'collection' : 'subscription'

const parser = ProxyUtils.JSON5 || JSON
log(`① 使用 ${ProxyUtils.JSON5 ? 'JSON5' : 'JSON'} 解析配置文件`)
let config
try {
  config = parser.parse($content ?? $files[0])
} catch (e) {
  log(`${e.message ?? e}`)
  throw new Error(`配置文件不是合法的 ${ProxyUtils.JSON5 ? 'JSON5' : 'JSON'} 格式`)
}
log(`② 获取订阅`)

let proxies
if (url) {
  log(`直接从 URL ${url} 读取订阅`)
  proxies = await produceArtifact({
    name,
    type,
    platform: 'sing-box',
    produceType: 'internal',
    produceOpts: {
      'include-unsupported-proxy': includeUnsupportedProxy,
    },
    subscription: {
      name,
      url,
      source: 'remote',
    },
  })
} else {
  log(`将读取名称为 ${name} 的 ${type === 'collection' ? '组合' : ''}订阅`)
  proxies = await produceArtifact({
    name,
    type,
    platform: 'sing-box',
    produceType: 'internal',
    produceOpts: {
      'include-unsupported-proxy': includeUnsupportedProxy,
    },
  })
}

log(`③ outbound 规则解析`)
const outbounds = outbound
  .split('🕳')
  .filter(i => i)
  .map(i => {
    let [outboundPattern, tagPattern = '.*'] = i.split('🏷')
    const tagRegex = createTagRegExp(tagPattern)
    log(`匹配 🏷 ${tagRegex} 的节点将插入匹配 🕳 ${createOutboundRegExp(outboundPattern)} 的 outbound 中`)
    return [outboundPattern, tagRegex]
  })

log(`④ outbound 插入节点`)
config.outbounds.map(outbound => {
  outbounds.map(([outboundPattern, tagRegex]) => {
    const outboundRegex = createOutboundRegExp(outboundPattern)
    if (outboundRegex.test(outbound.tag)) {
      if (!Array.isArray(outbound.outbounds)) {
        outbound.outbounds = []
      }
      const tags = getTags(proxies, tagRegex)
      log(`🕳 ${outbound.tag} 匹配 ${outboundRegex}, 插入 ${tags.length} 个 🏷 匹配 ${tagRegex} 的节点`)
      outbound.outbounds.push(...tags)
    }
  })
})

const compatible_outbound = {
  tag: 'COMPATIBLE',
  type: 'direct',
}

let compatible
log(`⑤ 空 outbounds 检查`)
config.outbounds.map(outbound => {
  outbounds.map(([outboundPattern, tagRegex]) => {
    const outboundRegex = createOutboundRegExp(outboundPattern)
    if (outboundRegex.test(outbound.tag)) {
      if (!Array.isArray(outbound.outbounds)) {
        outbound.outbounds = []
      }
      if (outbound.outbounds.length === 0) {
        if (!compatible) {
          config.outbounds.push(compatible_outbound)
          compatible = true
        }
        log(`🕳 ${outbound.tag} 的 outbounds 为空, 自动插入 COMPATIBLE(direct)`)
        outbound.outbounds.push(compatible_outbound.tag)
      }
    }
  })
})

config.outbounds.push(...proxies)

$content = JSON.stringify(config, null, 2)

function getTags(proxies, regex) {
  return (regex ? proxies.filter(p => regex.test(p.tag)) : proxies).map(p => p.tag)
}
function log(v) {
  console.log(`[📦 sing-box 模板脚本] ${v}`)
}
function createTagRegExp(tagPattern) {
  return new RegExp(tagPattern.replace('ℹ️', ''), tagPattern.includes('ℹ️') ? 'i' : undefined)
}
function createOutboundRegExp(outboundPattern) {
  return new RegExp(outboundPattern.replace('ℹ️', ''), outboundPattern.includes('ℹ️') ? 'i' : undefined)
}

log(`🔚 结束`)