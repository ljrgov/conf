// prettier-ignore
let ToolVersion = "201";

// 全局变量
let isCancelled = false;
let fromUrlScheme = false;
let folderPath;
let files = [];
let contents = [];
const fm = FileManager.iCloud();

// 日志系统
let logs = [];
const MAX_LOG_ENTRIES = 1000;
const LOG_CLEANUP_INTERVAL = 7 * 24 * 60 * 60 * 1000; // 7天

function log(message, type = 'info') {
  const logEntry = `[${new Date().toLocaleString()}] [${type.toUpperCase()}] ${message}`;
  logs.push(logEntry);
  if (logs.length > MAX_LOG_ENTRIES) {
    logs.shift();
  }
  console.log(logEntry);
}

function cleanupOldLogs() {
  const logFile = fm.joinPath(fm.documentsDirectory(), 'SurgeModuleToolLogs.json');
  if (fm.fileExists(logFile)) {
    const fileCreationDate = fm.creationDate(logFile);
    if (Date.now() - fileCreationDate.getTime() > LOG_CLEANUP_INTERVAL) {
      fm.remove(logFile);
      log('已清理旧日志文件', 'info');
    }
  }
}

function saveLogs() {
  const logFile = fm.joinPath(fm.documentsDirectory(), 'SurgeModuleToolLogs.json');
  fm.writeString(logFile, JSON.stringify(logs));
}

function readLogs() {
  const logFile = fm.joinPath(fm.documentsDirectory(), 'SurgeModuleToolLogs.json');
  if (fm.fileExists(logFile)) {
    const logContent = fm.readString(logFile);
    return JSON.parse(logContent);
  }
  return [];
}

async function showLogs() {
  const storedLogs = readLogs();
  const allLogs = [...storedLogs, ...logs];
  const logText = allLogs.join('\n');
  
  let alert = new Alert();
  alert.title = '脚本运行日志';
  alert.message = logText;
  alert.addAction('关闭');
  alert.addDestructiveAction('清除日志');
  const result = await alert.presentAlert();
  
  if (result === 1) {
    await clearLogs();
  }
}

async function clearLogs() {
  logs = [];
  const logFile = fm.joinPath(fm.documentsDirectory(), 'SurgeModuleToolLogs.json');
  if (fm.fileExists(logFile)) {
    fm.remove(logFile);
  }
  log('日志已清除', 'info');
  
  let alert = new Alert();
  alert.title = '日志已清除';
  alert.message = '所有日志记录已被删除。';
  alert.addAction('确定');
  await alert.presentAlert();
}

// 辅助函数
async function delay(milliseconds) {
  return new Promise(resolve => Timer.schedule(milliseconds / 1000, false, () => resolve()));
}

function convertToValidFileName(str) {
  const invalidCharsRegex = /[\/:*?"<>|]/g;
  const validFileName = str.replace(invalidCharsRegex, '_');
  const multipleDotsRegex = /\.{2,}/g;
  const fileNameWithoutMultipleDots = validFileName.replace(multipleDotsRegex, '.');
  const leadingTrailingDotsSpacesRegex = /^[\s.]+|[\s.]+$/g;
  const finalFileName = fileNameWithoutMultipleDots.replace(leadingTrailingDotsSpacesRegex, '');
  return finalFileName;
}

function addLineAfterLastOccurrence(text, addition) {
  const regex = /^#!.+?$/gm;
  const matchArray = text.match(regex);
  const lastIndex = matchArray ? matchArray.length - 1 : -1;
  if (lastIndex >= 0) {
    const lastMatch = matchArray[lastIndex];
    const insertIndex = text.indexOf(lastMatch) + lastMatch.length;
    const newText = text.slice(0, insertIndex) + addition + text.slice(insertIndex);
    return newText;
  }
  return text;
}

function compareContentIgnoringCategoryAndDesc(content1, content2) {
  const lines1 = content1.split('\n');
  const lines2 = content2.split('\n');
  
  if (lines1.length !== lines2.length) return false;
  
  for (let i = 0; i < lines1.length; i++) {
    const line1 = lines1[i].trim().toLowerCase();
    const line2 = lines2[i].trim().toLowerCase();
    
    if (line1.startsWith('#!category') || line1.startsWith('#!desc')) continue;
    if (line1 !== line2) return false;
  }
  
  return true;
}

// 更新脚本
async function update() {
  const dict = fm.documentsDirectory();
  const scriptName = 'SurgeModuleTool';
  let version;
  let resp;
  try {
    const url = 'https://raw.githubusercontent.com/ljrgov/conf/main/script/SurgeModuleTool/SurgeModuleTool.js?v=' + Date.now();
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
    log('获取在线版本失败: ' + e, 'error');
    return null;
  }
  
  if (!version) {
    log('无法获取在线版本', 'error');
    return null;
  }
  
  let needUpdate = version > ToolVersion;
  if (!needUpdate) {
    let alert = new Alert();
    alert.title = 'Surge 模块工具';
    alert.message = `当前版本: ${ToolVersion}\n在线版本: ${version}\n无需更新`;
    alert.addDestructiveAction('强制更新');
    alert.addCancelAction('关闭');
    let idx = await alert.presentAlert();
    if (idx === 0) {
      needUpdate = true;
    }
  }
  
  if (needUpdate) {
    fm.writeString(`${dict}/${scriptName}.js`, resp);
    log('更新成功: ' + version, 'info');
    let notification = new Notification();
    notification.title = 'Surge 模块工具 更新成功: ' + version;
    notification.subtitle = '点击通知跳转';
    notification.sound = 'default';
    notification.openURL = `scriptable:///open/${scriptName}`;
    notification.addAction('打开脚本', `scriptable:///open/${scriptName}`, false);
    await notification.schedule();
    return version;
  }
  
  return null;
}

// 模块处理
async function processModule(folderPath, file) {
  if (isCancelled) return null;
  if (file && !/\.(conf|txt|js|list)$/i.test(file)) {
    let currentName, currentDesc, currentCategory, noUrl;
    try {
      let content;
      let filePath = `${folderPath}/${file}`;
      if (contents.length > 0) {
        content = contents[files.indexOf(file)];
      } else {
        content = fm.readString(filePath);
      }

      const nameMatched = content.match(/^#\!name\s*?=\s*(.*?)\s*(\n|$)/im);
      if (nameMatched) {
        currentName = nameMatched[1];
      }

      const descMatched = content.match(/^#\!desc\s*?=\s*(.*?)\s*(\n|$)/im);
      if (descMatched) {
        currentDesc = descMatched[1];
        if (currentDesc) {
          currentDesc = currentDesc.replace(/^🔗.*?]\s*/i, '');
        }
      }

      const categoryRegex = /^#!category\s*?=\s*(.*?)\s*$/im;
      const categoryMatch = content.match(categoryRegex);
      if (categoryMatch) {
        currentCategory = categoryMatch[1];
      }

      const matched = content.match(/^#SUBSCRIBED\s+(.*?)\s*(\n|$)/im);
      if (!matched) {
        noUrl = true;
        throw new Error('无订阅链接');
      }
      const subscribed = matched[0];
      const url = matched[1];
      if (!url) {
        noUrl = true;
        throw new Error('无订阅链接');
      }

      const req = new Request(url);
      req.timeoutInterval = 10;
      req.method = 'GET';
      let res = await req.loadString();
      const statusCode = req.response.statusCode;
      if (statusCode < 200 || statusCode >= 400) {
        throw new Error(`statusCode: ${statusCode}`);
      }
      if (!res) {
        throw new Error(`未获取到模块内容`);
      }

      const newNameMatched = res.match(/^#\!name\s*?=\s*?\s*(.*?)\s*(\n|$)/im);
      if (!newNameMatched) {
        throw new Error(`不是合法的模块内容`);
      }
      const newName = newNameMatched[1];
      if (!newName) {
        throw new Error('模块无名称字段');
      }

      const newDescMatched = res.match(/^#\!desc\s*?=\s*?\s*(.*?)\s*(\n|$)/im);
      let newDesc = newDescMatched ? newDescMatched[1] : '';

      if (!newDescMatched) {
        res = `#!desc=\n${res}`;
      }
      res = res.replace(/^(#SUBSCRIBED|# 🔗 模块链接)(.*?)(\n|$)/gim, '');
      res = addLineAfterLastOccurrence(res, `\n\n# 🔗 模块链接\n${subscribed.replace(/\n/g, '')}\n`);
      content = res.replace(/^#\!desc\s*?=\s*/im, `#!desc=🔗 [${new Date().toLocaleString()}] `);

      // 设置初始分类值
      if (!categoryRegex.test(content)) {
        content = content.replace(/^(#!name.*?)$/im, `$1\n#!category=📚未分类`);
      } else {
        content = content.replace(categoryRegex, `#!category=📚未分类`);
      }

      return {
        content,
        name: newName,
        desc: newDesc,
        category: "📚未分类",
        filePath,
        originalContent: fm.fileExists(filePath) ? fm.readString(filePath) : null
      };
    } catch (e) {
      if (noUrl) {
        report.noUrl += 1;
      } else {
        report.fail.push(currentName || file);
      }

      log(`${noUrl ? '⚠️' : '❌'} ${currentName || ''}\n${file}\n${e}`, 'error');
      if (fromUrlScheme) {
        let alert = new Alert();
        alert.title = `${noUrl ? '⚠️' : '❌'} ${currentName || ''}\n${file}`;
        alert.message = `${e.message || e}`;
        alert.addCancelAction('关闭');
        await alert.presentAlert();
      }
    }
  }
  return null;
}

function updateCategory(content, newCategory) {
  const categoryRegex = /^#!category\s*?=.*?$/im;
  if (categoryRegex.test(content)) {
    return content.replace(categoryRegex, `#!category=${newCategory}`);
  } else {
    return content.replace(/^(#!name.*?)$/im, `$1\n#!category=${newCategory}`);
  }
}

async function processFiles() {
  let processedModules = [];
  for (const file of files) {
    if (isCancelled) break;
    const result = await processModule(folderPath, file);
    if (result) {
      processedModules.push(result);
    }
  }
  return processedModules;
}

// 菜单和用户界面
async function showSettingsMenu() {
  let alert = new Alert();
  alert.title = 'Surge 模块工具设置';
  alert.addAction('查看日志');
  alert.addAction('清除日志');
  alert.addAction('更新本脚本');
  alert.addCancelAction('返回');
  
  let idx = await alert.presentAlert();
  
  switch(idx) {
    case 0:
      await showLogs();
      break;
    case 1:
      await clearLogs();
      break;
    case 2:
      await updateScript();
      break;
  }
}

async function updateScript() {
  log('检查更新');
  let updateResult = await update();
  if (updateResult) {
    let alert = new Alert();
    alert.title = '更新成功';
    alert.message = `脚本已更新到版本: ${updateResult}`;
    alert.addAction('确定');
    await alert.presentAlert();
  } else {
    let alert = new Alert();
    alert.title = '更新失败';
    alert.message = '无法获取更新或已是最新版本';
    alert.addAction('确定');
    await alert.presentAlert();
  }
}

async function showMainMenu() {
  let alert = new Alert();
  alert.title = 'Surge 模块工具';
  alert.addAction('从链接创建');
  alert.addAction('更新单个模块');
  alert.addAction('更新全部模块');
  alert.addAction('设置');
  alert.addCancelAction('取消');
  
  let idx = await alert.presentAlert();
  
  switch(idx) {
    case 0:
      await createFromLink();
      break;
    case 1:
      await updateSingleModule();
      break;
    case 2:
      await updateAllModules();
      break;
    case 3:
      await showSettingsMenu();
      break;
    default:
      isCancelled = true;
      break;
  }
}

// 主要功能函数
async function createFromLink(url, name) {
  if (!url) {
    let alert</antArtifact>
    async function createFromLink(url, name) {
  if (!url) {
    let alert = new Alert();
    alert.title = '将自动添加后缀 .sgmodule';
    alert.addTextField('链接(必填)', '');
    alert.addTextField('名称(选填)', '');
    alert.addAction('下载');
    alert.addCancelAction('取消');
    let result = await alert.presentAlert();
    if (result === -1) {
      isCancelled = true;
      return;
    }
    url = alert.textFieldValue(0);
    name = alert.textFieldValue(1);
  }

  if (!name) {
    const plainUrl = url.split('?')[0];
    const fullname = plainUrl.substring(plainUrl.lastIndexOf('/') + 1);
    if (fullname) {
      name = fullname.replace(/\.sgmodule$/, '');
    }
    if (!name) {
      name = `untitled-${new Date().toLocaleString()}`;
    }
  }
  name = convertToValidFileName(name);
  files = [`${name}.sgmodule`];
  contents = [`#SUBSCRIBED ${url}`];
  folderPath = await DocumentPicker.openFolder();
  if (!folderPath) {
    isCancelled = true;
    return;
  }

  let processedModules = await processFiles();
  if (processedModules.length > 0) {
    await handleProcessedModules(processedModules);
  }
}

async function updateSingleModule() {
  const filePath = await DocumentPicker.openFile();
  if (!filePath) {
    isCancelled = true;
    return;
  }
  folderPath = filePath.substring(0, filePath.lastIndexOf('/'));
  files = [filePath.substring(filePath.lastIndexOf('/') + 1)];
  
  let processedModules = await processFiles();
  if (processedModules.length > 0) {
    await handleProcessedModules(processedModules);
  }
}

async function updateAllModules() {
  folderPath = await DocumentPicker.openFolder();
  if (!folderPath) {
    isCancelled = true;
    return;
  }
  files = fm.listContents(folderPath);
  
  let processedModules = await processFiles();
  if (processedModules.length > 0) {
    await handleProcessedModules(processedModules);
  }
}

async function handleProcessedModules(processedModules) {
  let shouldWrite = true;
  
  if (processedModules.length === 1 && fm.fileExists(processedModules[0].filePath)) {
    let isContentSame = compareContentIgnoringCategoryAndDesc(processedModules[0].content, processedModules[0].originalContent);
    let contentComparisonText = isContentSame ? "文件内容一致" : "文件内容不一致";
    let contentComparisonSymbol = isContentSame ? "" : "❗️";
    
    let confirmAlert = new Alert();
    confirmAlert.title = "文件替换";
    confirmAlert.message = `文件 "${processedModules[0].name}"\n\n${contentComparisonSymbol}${contentComparisonText}${contentComparisonSymbol}`;
    confirmAlert.addAction("替换");
    confirmAlert.addCancelAction("取消");
    let confirmResult = await confirmAlert.presentAlert();

    if (confirmResult === -1) {
      shouldWrite = false;
    }
  }

  if (shouldWrite) {
    for (const module of processedModules) {
      fm.writeString(module.filePath, module.content);
    }
    log(`已更新 ${processedModules.length} 个文件`, 'info');
    report.success = processedModules.length;

    let currentCategory = processedModules[0].category;
    let currentName = processedModules[0].name;

    let categoryAlert = new Alert();
    categoryAlert.title = "模块分类";
    categoryAlert.message = `模块名称：${currentName}\n当前类别：${currentCategory}`;
    categoryAlert.addAction("📙广告模块");
    categoryAlert.addAction("📗功能模块");
    categoryAlert.addAction("📘面板模块");
    categoryAlert.addCancelAction("取消");
    let categoryChoice = await categoryAlert.presentAlert();
    
    if (categoryChoice !== -1) {
      let newCategory;
      switch(categoryChoice) {
        case 0: newCategory = "📙广告模块"; break;
        case 1: newCategory = "📗功能模块"; break;
        case 2: newCategory = "📘面板模块"; break;
      }
      for (let module of processedModules) {
        module.content = updateCategory(module.content, newCategory);
        module.category = newCategory;
        fm.writeString(module.filePath, module.content);
      }
      log(`分类更新成功：${newCategory}`, 'info');
    } else {
      log(`分类未更新：${currentCategory}`, 'info');
    }
  } else {
    log("用户取消了替换操作", 'info');
    isCancelled = true;
  }
}

async function showReport() {
  let alert = new Alert();
  let totalModules = report.success + report.fail.length + report.noUrl;
  
  alert.title = `📦 模块总数: ${totalModules}`;
  
  let messageComponents = [''];
  
  if (report.success > 0) {
    messageComponents.push(`✅ 模块更新成功: ${report.success}`, '');
  }
  
  if (report.fail.length > 0) {
    messageComponents.push(`❌ 模块更新失败: ${report.fail.length}`, '');
  }
  
  if (report.noUrl > 0) {
    messageComponents.push(`⚠️ 无链接: ${report.noUrl}`, '');
  }
  
  if (messageComponents[messageComponents.length - 1] === '') {
    messageComponents.pop();
  }

  alert.message = messageComponents.join('\n');

  alert.addDestructiveAction('重载 Surge');
  alert.addAction('打开 Surge');
  alert.addCancelAction('关闭');

  let idx = await alert.presentAlert();
  if (idx == 0) {
    await reloadSurge();
  } else if (idx == 1) {
    Safari.open('surge://');
  }
}

async function reloadSurge() {
  const req = new Request('http://script.hub/reload');
  req.timeoutInterval = 10;
  req.method = 'GET';
  try {
    let res = await req.loadString();
    log("Surge 重载成功", 'info');
  } catch (error) {
    log("Surge 重载失败: " + error, 'error');
  }
}

// 主程序
async function main() {
  log(`Surge 模块工具 v${ToolVersion} 启动`, 'info');
  
  if (args.queryParameters.url) {
    fromUrlScheme = true;
    await createFromLink(args.queryParameters.url, args.queryParameters.name);
  } else {
    await showMainMenu();
  }

  if (isCancelled) {
    log("操作已取消", 'info');
    return;
  }

  if (!fromUrlScheme) {
    await showReport();
  }

  saveLogs();
  cleanupOldLogs();
}

let report = {
  success: 0,
  fail: [],
  noUrl: 0,
};

// 运行主程序
await main();

// 确保脚本正确结束
Script.complete();