const YAML = ProxyUtils.yaml;
let yamlObj = YAML.safeLoad($content ?? $files[0]);

/**
 * 替换 YAML 字段
 * @param {string} keyPath - 字段路径，类似 "proxy-providers.provider1.url"
 * @param {any} value - 新值
 */
function replaceYamlField(yamlObj, keyPath, value) {
  const pathParts = keyPath.split('.');
  let curr = yamlObj;
  for (let i = 0; i < pathParts.length - 1; i++) {
    if (!(pathParts[i] in curr)) return;
    curr = curr[pathParts[i]];
  }
  curr[pathParts[pathParts.length - 1]] = value;
}
// ---------------------
// ① 解析 YAML 并替换字段
// ---------------------
// 示例：替换 provider1 的 URL 和 health-check.enable
replaceYamlField(yamlObj, 'proxy-providers.provider1.url', 'https://gist.githubusercontent.com/xxxxxxxxxxxxxxxxxxxxxxxxxxxxx.list');
replaceYamlField(yamlObj, 'proxy-providers.provider1.health-check.enable', false);

// 生成 YAML 文本
let newContent = YAML.safeDump(yamlObj);

// 引号修正函数
function modifyYamlQuotes(content, rules) {
  rules.forEach(rule => {
    // 处理嵌套键路径，如 "proxy-providers.provider1.header.User-Agent"
    if (rule.key.includes('.')) {
      const keyParts = rule.key.split('.');
      const finalKey = keyParts[keyParts.length - 1];
      
      // 为嵌套键构建更精确的模式
      if (rule.isList) {
        // 处理嵌套列表 - 查找最后一个键作为列表
        const listPattern = new RegExp(
          `(\\s*${finalKey.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\s*:\\s*\\n)((?:\\s*-\\s*[^\\n]+\\n?)+)`, 
          'g'
        );
        
        content = content.replace(listPattern, (match, header, listItems) => {
          let modifiedList = listItems.replace(/(\s*-\s*)([^\n]+)/g, (itemMatch, dash, value) => {
            value = value.trim();
            value = applyQuoteRules(value, rule);
            return dash + value;
          });
          return header + modifiedList;
        });
      }
      return; // 跳过后续处理，因为已经处理了嵌套情况
    }

    // 转义特殊字符
    const keyPattern = rule.key.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');

    // 普通键值对处理
    if (!rule.isList && !rule.isFolded) {
      const regexKV = new RegExp(`(\\s*${keyPattern}\\s*:\\s*)([^\\n]+)`, 'g');
      content = content.replace(regexKV, (match, prefix, value) => {
        value = value.trim();
        value = applyQuoteRules(value, rule);
        return prefix + value;
      });
    }
    
    // 处理列表字段（非嵌套）
    if (rule.isList && !rule.key.includes('.')) {
      const regexList = new RegExp(
        `(\\s*${keyPattern}\\s*:\\s*\\n)((?:\\s*-\\s*[^\\n]+\\n?)+)`, 
        'g'
      );
      content = content.replace(regexList, (match, header, listItems) => {
        let modifiedList = listItems.replace(/(\s*-\s*)([^\n]+)/g, (itemMatch, dash, value) => {
          value = value.trim();
          value = applyQuoteRules(value, rule);
          return dash + value;
        });
        return header + modifiedList;
      });
    }

    // 处理折叠文本
    if (rule.isFolded) {
      // 匹配 key: >- 后的内容
      const regexFold = new RegExp(
        `(\\s*${keyPattern}\\s*:\\s*>-\\s*\\n)((?:\\s{2,}[^\\n]+(?:\\n|$))+)`, 
        'g'
      );
      
      content = content.replace(regexFold, (match, header, foldedContent) => {
        // 处理折叠内容中的每一行
        let lines = foldedContent.split('\n');
        lines = lines.map(line => {
          const trimmed = line.trim();
          if (!trimmed) return line; // 保持空行
          
          let modifiedValue = applyQuoteRules(trimmed, rule);
          // 保持原有缩进
          return line.replace(trimmed, modifiedValue);
        });
        
        return header + lines.join('\n');
      });
    }
  });

  return content;
}

/**
 * 应用引号规则的辅助函数
 */
function applyQuoteRules(value, rule) {
  // 移除引号
  if (rule.removeDoubleQuote && value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1);
  }
  if (rule.removeSingleQuote && value.startsWith("'") && value.endsWith("'")) {
    value = value.slice(1, -1);
  }
  
  // 添加引号
  if (rule.addDoubleQuote && !value.startsWith('"')) {
    value = `"${value}"`;
  }
  if (rule.addSingleQuote && !value.startsWith("'")) {
    value = `'${value}'`;
  }
  
  return value;
}
// ---------------------
// ② 正则修正引号
// ---------------------
// 使用示例
const rules = [  
  // 为 User-Agent 列表项添加双引号
  { key: 'User-Agent', addDoubleQuote: true, isList: true },
   // 去掉 external-controller 的单引号
  { key: 'external-controller', removeSingleQuote: true }, 
  { key: 'dns-hijack', removeSingleQuote: true, isList: true }, 
  { key: 'listen', removeSingleQuote: true }, 
  { key: 'rules', removeSingleQuote: true, isList: true },  
  // 为折叠的 external-ui-url 添加双引号
 // { key: 'external-ui-url', addDoubleQuote: true, isFolded: true },
  // 示例：为特定端口添加引号
 // { key: 'mixed-port', addSingleQuote: true },
  // 示例：移除 URL 的引号
  //{ key: 'url', removeDoubleQuote: true }
];

newContent = modifyYamlQuotes(newContent, rules);

// 输出最终 YAML
$content = newContent;
