// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: cloud-download-alt;

// Surge模块工具 v2.04
// 作者：AI助手（基于原始脚本优化）
// 更新日期：2024-09-11

let ToolVersion = "2.04";

// 辅助函数：延迟执行
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 文件名转换函数
function convertToValidFileName(str) {
  const invalidCharsRegex = /[\/:*?"<>|]/g;
  const multipleDotsRegex = /\.{2,}/g;
  const leadingTrailingDotsSpacesRegex = /^[\s.]+|[\s.]+$/g;
  
  return str
    .replace(invalidCharsRegex, '_')
    .replace(multipleDotsRegex, '.')
    .replace(leadingTrailingDotsSpacesRegex, '');
}

// 在最后一个 #! 行后添加内容
function addLineAfterLastOccurrence(text, addition) {
  const regex = /^#!.+?$/gm;
  const matchArray = text.match(regex);
  const lastIndex = matchArray ? matchArray.length - 1 : -1;
  
  if (lastIndex >= 0) {
    const lastMatch = matchArray[lastIndex];
    const insertIndex = text.lastIndexOf(lastMatch) + lastMatch.length;
    return text.slice(0, insertIndex) + '\n' + addition + text.slice(insertIndex);
  }
  
  return text;
}

// 更新模块分类
async function updateModuleCategory(moduleName, moduleContent) {
  const alert = new Alert();
  alert.title = "模块分类";
  alert.message = `当前模块：${moduleName}`;
  alert.addAction("📙广告模块");
  alert.addAction("📗功能模块");
  alert.addAction("📘面板模块");
  alert.addCancelAction("📚取消分类");
  
  const choice = await alert.presentAlert();
  let category = "";
  
  switch (choice) {
    case 0:
      category = "📙广告模块";
      break;
    case 1:
      category = "📗功能模块";
      break;
    case 2:
      category = "📘面板模块";
      break;
    default:
      return { moduleContent, log: "未更新分类" };
  }
  
  const categoryRegex = /^#!category=.+$/m;
  if (categoryRegex.test(moduleContent)) {
    moduleContent = moduleContent.replace(categoryRegex, `#!category=${category}`);
  } else {
    const nameRegex = /^#!name=.+$/m;
    if (nameRegex.test(moduleContent)) {
      moduleContent = moduleContent.replace(nameRegex, `$&\n#!category=${category}`);
    } else {
      moduleContent = `#!category=${category}\n${moduleContent}`;
    }
  }
  
  return { moduleContent, log: `更新分类为：${category}` };
}

// 从链接创建模块
async function createModuleFromLink(url, name) {
  try {
    const req = new Request(url);
    const content = await req.loadString();
    
    let moduleName = name || url.split('/').pop() || `untitled-${new Date().toLocaleString()}`;
    moduleName = convertToValidFileName(moduleName);
    
    let moduleContent = content;
    if (!/#!category/.test(moduleContent)) {
      moduleContent = `#!category=📚未分类\n${moduleContent}`;
    }
    
    moduleContent = addLineAfterLastOccurrence(moduleContent, `\n# 🔗 模块链接\n#SUBSCRIBED ${url}\n`);
    
    const filePath = `${moduleName}.sgmodule`;
    await DocumentPicker.exportString(moduleContent, filePath);
    
    const { moduleContent: updatedContent, log } = await updateModuleCategory(moduleName, moduleContent);
    await DocumentPicker.exportString(updatedContent, filePath);
    
    return { success: true, name: moduleName, log };
  } catch (error) {
    return { success: false, name: url, error: error.message };
  }
}

// 更新单个模块
async function updateSingleModule(filePath) {
  try {
    const fm = FileManager.iCloud();
    const content = fm.readString(filePath);
    const subscribedRegex = /#SUBSCRIBED\s+(.+)/;
    const match = content.match(subscribedRegex);
    
    if (!match) {
      return { success: false, name: fm.fileName(filePath), error: "无订阅链接" };
    }
    
    const url = match[1].trim();
    const req = new Request(url);
    let newContent = await req.loadString();
    
    const nameRegex = /#!name\s*=\s*(.+)/;
    const descRegex = /#!desc\s*=\s*(.+)/;
    const nameMatch = newContent.match(nameRegex);
    const descMatch = newContent.match(descRegex);
    
    if (nameMatch) {
      const name = nameMatch[1].trim();
      newContent = newContent.replace(nameRegex, `#!name=${name}`);
    }
    
    if (descMatch) {
      const desc = `${descMatch[1].trim()} (更新于: ${new Date().toLocaleString('zh-CN')})`;
      newContent = newContent.replace(descRegex, `#!desc=${desc}`);
    }
    
    newContent = addLineAfterLastOccurrence(newContent, `\n# 🔗 模块链接\n#SUBSCRIBED ${url}\n`);
    
    const { moduleContent, log } = await updateModuleCategory(fm.fileName(filePath), newContent);
    fm.writeString(filePath, moduleContent);
    
    return { success: true, name: fm.fileName(filePath), log };
  } catch (error) {
    return { success: false, name: fm.fileName(filePath), error: error.message };
  }
}

// 更新全部模块
async function updateAllModules(folderPath) {
  const fm = FileManager.iCloud();
  const files = fm.listContents(folderPath);
  const results = [];
  
  for (const file of files) {
    if (file.endsWith('.sgmodule')) {
      const filePath = fm.joinPath(folderPath, file);
      results.push(await updateSingleModule(filePath));
    }
  }
  
  return results;
}

// 更新脚本
async function update() {
  const fm = FileManager.iCloud();
  const dict = fm.documentsDirectory();
  const scriptName = 'SurgeModuleTool';
  let version;
  let resp;
  try {
    const url = 'https://raw.githubusercontent.com/Script-Hub-Org/Script-Hub/main/SurgeModuleTool.js?v=' + Date.now();
    let req = new Request(url);
    req.method = 'GET';
    req.headers = {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    };
    resp = await req.loadString();

    const regex = /let ToolVersion = "([\d.]+)"/;
    const match = resp.match(regex);
    version = match ? match[1] : '';
  } catch (e) {
    console.error(e);
  }

  if (!version) {
    let alert = new Alert();
    alert.title = 'Surge 模块工具';
    alert.message = '无法获取在线版本';
    alert.addCancelAction('关闭');
    await alert.presentAlert();
    return;
  } else {
    let needUpdate = version > ToolVersion;
    if (!needUpdate) {
      let alert = new Alert();
      alert.title = 'Surge 模块工具';
      alert.message = `当前版本: ${ToolVersion}\n在线版本: ${version}\n无需更新`;
      alert.addDestructiveAction('强制更新');
      alert.addCancelAction('关闭');
      idx = await alert.presentAlert();
      if (idx === 0) {
        needUpdate = true;
      }
    }
    if (needUpdate) {
      fm.writeString(`${dict}/${scriptName}.js`, resp);
      console.log('更新成功: ' + version);
      let notification = new Notification();
      notification.title = 'Surge 模块工具 更新成功: ' + version;
      notification.subtitle = '点击通知跳转';
      notification.sound = 'default';
      notification.openURL = `scriptable:///open/${scriptName}`;
      notification.addAction('打开脚本', `scriptable:///open/${scriptName}`, false);
      await notification.schedule();
    }
  }
}

// 主函数
async function main() {
  const fromUrlScheme = args.queryParameters.url !== undefined;
  let action;
  
  if (fromUrlScheme) {
    action = "从链接创建";
  } else {
    const alert = new Alert();
    alert.title = "Surge 模块工具";
    alert.addAction("从链接创建");
    alert.addAction("更新单个模块");
    alert.addAction("更新全部模块");
    alert.addDestructiveAction("更新本脚本");
    alert.addCancelAction("取消");
    const choice = await alert.presentAlert();
    action = ["从链接创建", "更新单个模块", "更新全部模块", "更新本脚本", "取消"][choice];
  }
  
  let results = [];
  
  switch (action) {
    case "从链接创建":
      const url = fromUrlScheme ? args.queryParameters.url : await askForInput("请输入模块链接");
      const name = fromUrlScheme ? args.queryParameters.name : await askForInput("请输入模块名称（可选）");
      if (url) {
        results.push(await createModuleFromLink(url, name));
      }
      break;
    case "更新单个模块":
      const filePath = await DocumentPicker.openFile();
      if (filePath) {
        results.push(await updateSingleModule(filePath));
      }
      break;
    case "更新全部模块":
      const folderPath = await DocumentPicker.openFolder();
      if (folderPath) {
        results = await updateAllModules(folderPath);
      }
      break;
    case "更新本脚本":
      await update();
      return;
    case "取消":
      return;
  }
  
  showResults(results);
}

// 辅助函数：请求用户输入
async function askForInput(prompt) {
  const alert = new Alert();
  alert.title = prompt;
  alert.addTextField();
  alert.addAction("确定");
  alert.addCancelAction("取消");
  
  const response = await alert.present();
  return response === -1 ? null : alert.textFieldValue(0);
}

// 辅助函数：显示结果
async function showResults(results) {
  const successes = results.filter(r => r.success);
  const failures = results.filter(r => !r.success);
  
  let message = `成功：${successes.length}\n失败：${failures.length}\n\n`;
  
  if (failures.length > 0) {
    message += "失败的模块：\n";
    failures.forEach(f => {
      message += `${f.name}: ${f.error}\n`;
    });
  }
  
  const alert = new Alert();
  alert.title = "操作结果";
  alert.message = message;
  alert.addAction("重载 Surge");
  alert.addAction("打开 Surge");
  alert.addCancelAction("关闭");
  
  const choice = await alert.present();
  
  switch (choice) {
    case 0:
      Safari.open("surge:///reloadconfig");
      break;
    case 1:
      Safari.open("surge:///");
      break;
  }
}

// 运行主函数
await main();
