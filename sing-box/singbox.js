// 方法一:
//
https://raw.githubusercontent.com/xream/scripts/main/surge/modules/sub-store-scripts/sing-box/template.js#type=组合订阅&name=subs&outbound=🕳ℹ️📦 手动选择🕳ℹ️🎮 游戏🏷ℹ️^(?:(?!mi|lg).)*(🇯🇵|🇨🇳|🇹🇼).*$🕳ℹ️🇭🇰 香港🏷ℹ️^(?:(?!游戏|bv).)*(港|hk|hong|🇭🇰).*$🕳ℹ️🇨🇳 台湾🏷ℹ️^(?:(?!游戏|dj).)*(台|tw|taiwan|🇨🇳|🇹🇼).*$🕳ℹ️🇯🇵 日本🏷ℹ️^(?:(?!游戏|bv).)*(日本|jp|japan|🇯🇵).*$🕳ℹ️🇺🇸 美国🏷ℹ️^(?:(?!游戏|lg|dj).)*(美|us|united|🇺🇸).*$🕳ℹ️🇸🇬 新加坡🏷ℹ️^(?:(?!us|游戏|bv).)*(新|sg|sing|🇸🇬).*$


//方法2: sub store 本地添加或更改参数如下:
// 1.    type  组合订阅
// 2.    name  subs
// 3.    outbound  🕳ℹ️📦 手动选择🕳ℹ️🎮 游戏🏷ℹ️^(?:(?!mi|lg).)*(🇯🇵|🇨🇳|🇹🇼).*$🕳ℹ️🇭🇰 香港🏷ℹ️^(?:(?!游戏|bv).)*(港|hk|hong|🇭🇰).*$🕳ℹ️🇨🇳 台湾🏷ℹ️^(?:(?!游戏|dj).)*(台|tw|taiwan|🇨🇳|🇹🇼).*$🕳ℹ️🇯🇵 日本🏷ℹ️^(?:(?!游戏|bv).)*(日本|jp|japan|🇯🇵).*$🕳ℹ️🇺🇸 美国🏷ℹ️^(?:(?!游戏|lg|dj).)*(美|us|united|🇺🇸).*$🕳ℹ️🇸🇬 新加坡🏷ℹ️^(?:(?!us|游戏|bv).)*(新|sg|sing|🇸🇬).*$



// 示例说明
// 读取 名称为 "机场" 的 组合订阅 中的节点(单订阅不需要设置 type 参数)   🕳 后面, ℹ️ 表示忽略大小写
// ​🕳🇭🇰 香港🏷ℹ️(港|hk|hongkong|kong kong|🇭🇰)(?!(.*游戏|dj|bv))
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

let proxies = []
let outbounds = []
let endpoints = []
let data = {}
if (url) {
  log(`直接从 URL ${url} 读取订阅`)
  data = await produceArtifact({
    name,
    type,
    platform: 'sing-box',
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
  data = await produceArtifact({
    name,
    type,
    platform: 'sing-box',
    produceOpts: {
      'include-unsupported-proxy': includeUnsupportedProxy,
    },
  })
  console.log(data)
}
data = JSON.parse(data)
outbounds = data.outbounds ?? []
endpoints = data.endpoints ?? []
proxies = [...outbounds, ...endpoints]
log(`获取到 ${outbounds.length} 个节点, ${endpoints.length} 个端点`)

log(`③ outbound 规则解析`)
const outboundRules = outbound
  .split('🕳')
  .filter(i => i)
  .map(i => {
    let [outboundPattern, tagPattern = '.*'] = i.split('🏷')
    const tagRegex = createTagRegExp(tagPattern)
    log(`匹配 🏷 ${tagRegex} 的节点将插入匹配 🕳 ${createOutboundRegExp(outboundPattern)} 的 outbound 中`)
    return [outboundPattern, tagRegex]
  })

log(`④ outbound 插入节点`)
if (!Array.isArray(config.outbounds)) {
  config.outbounds = []
}
config.outbounds.map(outbound => {
  outboundRules.map(([outboundPattern, tagRegex]) => {
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
  outboundRules.map(([outboundPattern, tagRegex]) => {
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

config.outbounds.push(...outbounds)
if (!Array.isArray(config.endpoints)) {
  config.endpoints = []
}
config.endpoints.push(...endpoints)

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