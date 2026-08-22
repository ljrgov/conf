/**
* Sub Store 远程脚本：mihomo YAML 参数版
*/
async function execute() {
  const args = typeof $arguments !== 'undefined' ? $arguments : {};
  const urlArgs = Object.keys(args)
    .filter(k => /^url\d*$/.test(k))
    .sort()
    .map(k => args[k]);
  const { secret, device: rawDevice, nocache: rawNocache } = args;

  const device = (rawDevice || '').toLowerCase();
  const tunEnable = ['tun', 'client', 'android', 'windows', 'win'].includes(device);
  const isEbpfDevice = device === 'ebpf';
  const nocache = rawNocache === true || String(rawNocache).toLowerCase() === 'true';

  // --- 工具函数：提取顶层 key 对应的整个块（含所有子字段），不含前置注释 ---
  function extractBlock(content, key) {
    const startRegex = new RegExp(`^${key}:.*$`, 'm');
    const startMatch = content.match(startRegex);
    if (!startMatch) return null;
    const startIndex = startMatch.index;
    const afterStart = startIndex + startMatch[0].length;
    const rest = content.slice(afterStart);
    const nextTop = rest.match(/\n(?=\S)/);
    const endIndex = nextTop ? afterStart + nextTop.index + 1 : content.length;
    return {
      before: content.slice(0, startIndex),
      block: content.slice(startIndex, endIndex),
      after: content.slice(endIndex)
    };
  }

  // --- 1. 替换 proxy-providers 块内的 url（只在该块范围内替换）---
  if (urlArgs.length > 0) {
    const pp = extractBlock($content, 'proxy-providers');
    if (pp) {
      let count = 0;
      const newBlock = pp.block.replace(/url:\s*"[^"]*"/g, (match) => {
        const newUrl = urlArgs[count++];
        return newUrl ? `url: "${newUrl}"` : match;
      });
      $content = pp.before + newBlock + pp.after;
    }
  }

  // --- 2. 替换顶层 secret ---
  if (secret) {
    $content = $content.replace(/^secret:\s*"[^"]*"/m, `secret: "${secret}"`);
  }

  // --- 3. tun.enable 按 device 动态设置 ---
  {
    const tun = extractBlock($content, 'tun');
    if (tun) {
      const newBlock = tun.block.replace(
        /^(\s*)enable:\s*\S+/m,
        `$1enable: ${tunEnable}`
      );
      $content = tun.before + newBlock + tun.after;
    }
  }

  // --- 4. ebpf listeners 字段：只有 device=ebpf 时保留，其他情况（含不传）一律删除该字段及其子字段 ---
  if (!isEbpfDevice) {
    const listeners = extractBlock($content, 'listeners');
    if (listeners) {
      $content = listeners.before + listeners.after;
    }
  }

  // --- 5. GitHub 镜像加速（防止已带前缀的 url 被重复加前缀）---
  const mirrorPrefix = 'https://v6.gh-proxy.org/';
  const githubPattern = /(https?:\/\/(?:raw\.githubusercontent|gist\.githubusercontent|objects\.githubusercontent|github)\.com\/)/g;

  $content = $content.replace(githubPattern, (match, domain, offset, str) => {
    const before = str.slice(Math.max(0, offset - mirrorPrefix.length), offset);
    if (before === mirrorPrefix) {
      return match;
    }
    return mirrorPrefix + match;
  });

  // --- 6. 可选：给 Gist 订阅链接加时间戳绕过 CDN 缓存（nocache=true 才生效，只作用于 gist）---
  if (nocache) {
    const gistPattern = /(https?:\/\/gist\.githubusercontent\.com\/[^\s"']+)/g;
    const ts = Date.now();

    $content = $content.replace(gistPattern, (match) => {
      const sep = match.includes('?') ? '&' : '?';
      return `${match}${sep}_t=${ts}`;
    });
  }
}

await execute();