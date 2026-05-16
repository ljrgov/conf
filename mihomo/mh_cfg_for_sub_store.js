/**
* Sub Store 远程脚本：参数版 
*/
async function execute() {
  // 获取参数
  const args = typeof $arguments !== 'undefined' ? $arguments : {};
  const urlArgs = Object.keys(args)
    .filter(k => k.startsWith('url'))
    .sort()
    .map(k => args[k]);

  const { secret } = args;

  // 替换 proxy-providers 里的 url
  // 使用字符串分割再拼接，绕过正则解析器的 "/" 报错风险
  if (urlArgs.length > 0 && $content.includes('proxy-providers:')) {
    let parts = $content.split('proxy-providers:');
    let mainContent = parts[0];
    let ppBlock = parts[1];

    let count = 0;
    // 替换 url: "..."
    ppBlock = ppBlock.replace(/url:\s*"[^"]*"/g, (match) => {
      const newUrl = urlArgs[count++];
      return newUrl ? `url: "${newUrl}"` : match;
    });

    $content = mainContent + 'proxy-providers:' + ppBlock;
  }

  // 替换顶层 secret
  if (secret) {
    // 简化正则，确保开头结尾闭合正确
    $content = $content.replace(/^secret:\s*"[^"]*"/m, `secret: "${secret}"`);
  }
  // 统一处理 GitHub 添加加速镜像
  // 定义匹配 GitHub 相关域名的正则
  const pattern = /(https?:\/\/(?:raw\.githubusercontent|gist\.githubusercontent|objects\.githubusercontent|github)\.com\/)/g;
//添加加速镜像，替换为直连
  $content = $content.replace(pattern, 'https://v6.gh-proxy.org/$1');
}

await execute();
