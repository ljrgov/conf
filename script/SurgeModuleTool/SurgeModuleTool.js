// Surge Module Tool
let ToolVersion = "2";

// 全局变量
let isCancelled = false;
let fromUrlScheme = false;
let isOpenedFromButton = false;
let folderPath;
let files = [];
let contents = [];
const fm = FileManager.iCloud();

// 日志系统
let logs = [];
const MAX_LOG_ENTRIES = 1000;
const LOG_CLEANUP_INTERVAL = 7 * 24 * 60 * 60 * 1000; // 7天

let logBuffer = [];
const BUFFER_SIZE = 10;
const FLUSH_INTERVAL = 5000; // 5秒

let lastFlushTime = Date.now();

function log(message, level = 'INFO', details = null) {
  const timestamp = new Date().toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });
  let logEntry = `[${timestamp}] [${level.padEnd(7)}] ${message}`;
  
  if (details) {
    if (typeof details === 'object') {
      logEntry += '\nDetails: ' + JSON.stringify(details, null, 2);
    } else {
      logEntry += '\nDetails: ' + details;
    }
  }
  
  logBuffer.push(logEntry);
  
  if (logBuffer.length >= BUFFER_SIZE || Date.now() - lastFlushTime >= FLUSH_INTERVAL) {
    flushLogs();
  }
}

function flushLogs() {
  if (logBuffer.length > 0) {
    logs.push(...logBuffer);
    console.log(logBuffer.join('\n'));
    logBuffer = [];
    
    while (logs.length > MAX_LOG_ENTRIES) {
      logs.shift();
    }
    
    lastFlushTime = Date.now();
  }
}

function checkFlush() {
  if (Date.now() - lastFlushTime >= FLUSH_INTERVAL) {
    flushLogs();
  }
}

Script.complete = () => {
  flushLogs();
  saveLogs();
};

async function saveLogs() {
  const logFile = fm.joinPath(fm.documentsDirectory(), 'SurgeModuleToolLogs.json');
  try {
    await fm.writeString(logFile, JSON.stringify(logs));
    log('Logs saved successfully', 'INFO', { file: logFile });
  } catch (error) {
    logError('Failed to save logs', error);
  }
}

function logError(message, error) {
  log(message, 'ERROR', {
    name: error.name,
    message: error.message,
    stack: error.stack
  });
}

function logOperation(operation, result, details = null) {
  const level = result === 'SUCCESS' ? 'INFO' : 'WARN';
  log(`Operation: ${operation}, Result: ${result}`, level, details);
}

function logConflict(conflictType, details) {
  log(`Conflict detected: ${conflictType}`, 'WARN', details);
}

function logScriptExecution(stage) {
  const message = stage === 'START' ? 'Script execution started' : 'Script execution completed';
  log(message, 'INFO', { version: ToolVersion, stage: stage });
}

function logUserAction(action, details = null) {
  log(`User Action: ${action}`, 'INFO', details);
}

function logFileOperation(operation, filePath, result) {
  log(`File Operation: ${operation}`, result === 'SUCCESS' ? 'INFO' : 'WARN', { filePath, result });
}

function logNetworkRequest(url, method, statusCode, responseTime) {
  log(`Network Request`, 'INFO', { url, method, statusCode, responseTime });
}

function cleanupOldLogs() {
  const logFile = fm.joinPath(fm.documentsDirectory(), 'SurgeModuleToolLogs.json');
  if (fm.fileExists(logFile)) {
    const fileCreationDate = fm.creationDate(logFile);
    if (Date.now() - fileCreationDate.getTime() > LOG_CLEANUP_INTERVAL) {
      try {
        fm.remove(logFile);
        log('Old log file cleaned up successfully', 'INFO', { file: logFile, creationDate: fileCreationDate });
      } catch (error) {
        logError('Failed to clean up old log file', error);
      }
    } else {
      log('Log file does not need cleanup yet', 'DEBUG', { file: logFile, creationDate: fileCreationDate });
    }
  } else {
    log('No existing log file found for cleanup', 'DEBUG');
  }
}

function readLogs() {
  const logFile = fm.joinPath(fm.documentsDirectory(), 'SurgeModuleToolLogs.json');
  if (fm.fileExists(logFile)) {
    try {
      const logContent = fm.readString(logFile);
      return JSON.parse(logContent);
    } catch (error) {
      logError('Failed to read logs', error);
      return [];
    }
  }
  return [];
}

// 模块化重构 (适配 Scriptable)
const FileOperations = {
  readFile: function(path) {
    return fm.readString(path);
  },
  writeFile: function(path, content) {
    fm.writeString(path, content);
  },
  listContents: function(path) {
    return fm.listContents(path);
  }
};

const NetworkOperations = {
  fetchModule: async function(url) {
    const req = new Request(url);
    req.timeoutInterval = 10;
    req.method = 'GET';
    const startTime = Date.now();
    let res = await req.loadString();
    const responseTime = Date.now() - startTime;
    logNetworkRequest(url, 'GET', req.response.statusCode, responseTime);
    return res;
  }
};

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
  
  const filterLines = (lines) => lines.filter(line => 
    !line.trim().toLowerCase().startsWith('#!category') && 
    !line.trim().toLowerCase().startsWith('#!desc')
  );
  
  const filteredLines1 = filterLines(lines1);
  const filteredLines2 = filterLines(lines2);
  
  if (filteredLines1.length !== filteredLines2.length) return false;
  
  for (let i = 0; i < filteredLines1.length; i++) {
    if (filteredLines1[i].trim() !== filteredLines2[i].trim()) return false;
  }
  
  return true;
}

function updateCategory(content, newCategory) {
  const categoryRegex = /^#!category\s*?=.*?$/im;
  if (categoryRegex.test(content)) {
    return content.replace(categoryRegex, `#!category=${newCategory}`);
  } else {
    return content.replace(/^(#!name.*?)$/im, `$1\n#!category=${newCategory}`);
  }
}

// 更新脚本
async function update(forceUpdate = false) {
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
    const startTime = Date.now();
    resp = await req.loadString();
    const responseTime = Date.now() - startTime;
    logNetworkRequest(url, 'GET', req.response.statusCode, responseTime);
    const regex = /let ToolVersion = "([\d.]+)"/;
    const match = resp.match(regex);
    version = match ? match[1] : '';
  } catch (e) {
    logError('获取在线版本失败', e);
    return null;
  }
  
  if (!version) {
    log('无法获取在线版本', 'ERROR');
    return null;
  }
  
  let needUpdate = version > ToolVersion || forceUpdate;
  if (needUpdate) {
    try {
      fm.writeString(`${dict}/${scriptName}.js`, resp);
      log('更新成功', 'INFO', { version });
      return version;
    } catch (error) {
      logError('更新失败', error);
      return null;
    }
  }
  
  return null;
}

// 重构的核心功能
async function processModules(updateType) {
  let processedModules = await processFiles();
  if (processedModules.length > 0) {
    await handleProcessedModules(processedModules, updateType);
  }
}

async function processFiles() {
  const processPromises = files.map(file => processModule(folderPath, file));
  const processedModules = await Promise.all(processPromises);
  return processedModules.filter(module => module !== null);
}

async function processModule(folderPath, file) {
  if (isCancelled) {
    log('Module processing cancelled', 'WARN', { file });
    return null;
  }
  if (file && !/\.(conf|txt|js|list)$/i.test(file)) {
    let currentName, currentDesc, currentCategory, noUrl;
    try {
      let content;
      let filePath = `${folderPath}/${file}`;
      if (contents.length > 0) {
        content = contents[files.indexOf(file)];
      } else {
        content = FileOperations.readFile(filePath);
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

      let res = await NetworkOperations.fetchModule(url);

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
        originalContent: fm.fileExists(filePath) ? FileOperations.readFile(filePath) : null
      };
    } catch (e) {
      if (noUrl) {
        report.noUrl += 1;
        log(`模块缺少订阅链接`, 'WARN', { file, currentName });
      } else {
        report.fail.push(currentName || file);
        logError(`模块处理失败`, e);
      }
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

async function createFromLink(url, name) {
  if (!url) {
    let alert = new Alert();
    alert.title = '将自动添加后缀 .sgmodule';
    alert.addTextField('模块链接(必填)', '');
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

  await processModules('create_from_link');
}

async function updateSingleModule() {
  const filePath = await DocumentPicker.openFile();
  if (!filePath) {
    isCancelled = true;
    return;
  }
  folderPath = filePath.substring(0, filePath.lastIndexOf('/'));
  files = [filePath.substring(filePath.lastIndexOf('/') + 1)];
  
  await processModules('update_single');
}

async function updateAllModules() {
  folderPath = await DocumentPicker.openFolder();
  if (!folderPath) {
    isCancelled = true;
    return;
  }
  files = FileOperations.listContents(folderPath);
  
  await processModules('update_all');
}

async function handleProcessedModules(processedModules, updateType) {
  if (processedModules.length === 0) {
    log("没有处理任何模块", 'WARN');
    return;
  }

  for (const module of processedModules) {
    let shouldWrite = true;

    if (updateType === 'create_from_link' && fm.fileExists(module.filePath)) {
      let isContentSame = compareContentIgnoringCategoryAndDesc(module.content, module.originalContent);
      if (!isContentSame) {
        let confirmAlert = new Alert();
        confirmAlert.title = "文件替换确认";
        confirmAlert.message = `文件 "${module.name}" 的内容已更改。是否替换？`;
        confirmAlert.addAction("替换");
        confirmAlert.addCancelAction("取消");
        let confirmResult = await confirmAlert.presentAlert();

        if (confirmResult === -1) {
          shouldWrite = false;
          log(`用户取消了替换操作: ${module.name}`, 'INFO');
        }
      } else {
        log(`文件 "${module.name}" 内容未变，无需更新`, 'INFO');
        shouldWrite = false;
      }
    }

    if (shouldWrite) {
      FileOperations.writeFile(module.filePath, module.content);
      log(`更新文件: ${module.name}`, 'INFO');
      report.success++;
    }
  }

  log(`已处理 ${report.success} 个文件`, 'INFO');

  // 分类选择逻辑
  if (processedModules.length > 0) {
    let currentCategory = processedModules[0].category;
    let currentName = processedModules[0].name;

    let categoryAlert = new Alert();
    categoryAlert.title = "模块分类";
    categoryAlert.message = `模块名称：${currentName}\n当前类别：${currentCategory}`;
    categoryAlert.addAction("📙广告模块");
    categoryAlert.addAction("📗功能模块");
    categoryAlert.addAction("📘面板模块");
    categoryAlert.addCancelAction("📚取消分类");
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
        FileOperations.writeFile(module.filePath, module.content);
        log(`更新分类: ${module.name} -> ${newCategory}`, 'INFO');
      }
      categoryUpdateResult = `✅分类更新成功：${newCategory}`;
      log(`分类更新成功：${newCategory}`, 'INFO');
    } else {
      categoryUpdateResult = `⚠️分类未更新：${currentCategory}`;
      log(`分类未更新：${currentCategory}`, 'INFO');
    }
  }
}

// 菜单和用户界面
async function showMainMenu() {
  let alert = new Alert();
  alert.title = 'Surge 模块工具';
  alert.addAction('设置');
  alert.addAction('从链接创建');
  alert.addAction('更新单个模块');
  alert.addAction('更新全部模块');
  alert.addCancelAction('取消');
  
  let idx = await alert.presentAlert();
  
  switch(idx) {
    case 0:
      await showSettingsMenu();
      break;
    case 1:
      await createFromLink();
      break;
    case 2:
      await updateSingleModule();
      break;
    case 3:
      await updateAllModules();
      break;
    default:
      isCancelled = true;
      break;
  }
}

async function showSettingsMenu() {
  let alert = new Alert();
  alert.title = 'Surge 模块工具设置';
  alert.addAction('检查更新');
  alert.addAction('查看日志');
  alert.addAction('清除日志');
  alert.addAction('返回主菜单');
  
  let idx = await alert.presentAlert();
  
  switch(idx) {
    case 0:
      await checkForUpdates();
      break;
    case 1:
      await showLogs();
      break;
    case 2:
      await clearLogs();
      break;
    case 3:
    default:
      await showMainMenu();
      return;
  }
  // 执行完设置操作后，自动返回设置菜单
  await showSettingsMenu();
}

async function checkForUpdates() {
  log('检查更新');
  let updateResult = await update();
  let alert = new Alert();
  if (updateResult) {
    alert.title = '更新成功';
    alert.message = `脚本已更新到版本: ${updateResult}`;
    alert.addAction('确定');
  } else {
    alert.title = '无需更新';
    alert.message = '当前已是最新版本';
    alert.addAction('确定');
    alert.addDestructiveAction('强制更新');
  }
  let choice = await alert.presentAlert();
  if (!updateResult && choice === 1) {
    await forceUpdate();
  }
}

async function forceUpdate() {
  log('强制更新');
  let updateResult = await update(true);
  if (updateResult) {
    let alert = new Alert();
    alert.title = '更新成功';
    alert.message = `脚本已强制更新到版本: ${updateResult}`;
    alert.addAction('确定');
    alert.addAction('打开脚本');
    let choice = await alert.presentAlert();
    if (choice === 1) {
      Safari.open(`scriptable:///open/${Script.name()}`);
    }
  }
}

async function showLogs() {
  const storedLogs = readLogs();
  const allLogs = [...storedLogs, ...logs];
  const logText = allLogs.join('\n');
  
  let alert = new Alert();
  alert.title = '脚本运行日志';
  alert.message = logText;
  alert.addAction('关闭');
  await alert.presentAlert();
}

async function clearLogs() {
  let alert = new Alert();
  alert.title = '清除日志';
  alert.message = '确定要清除所有日志记录吗？';
  alert.addDestructiveAction('清除');
  alert.addCancelAction('取消');

  let choice = await alert.presentAlert();
  if (choice === 0) {
    logs = [];
    const logFile = fm.joinPath(fm.documentsDirectory(), 'SurgeModuleToolLogs.json');
    if (fm.fileExists(logFile)) {
      fm.remove(logFile);
    }
    log('日志已清除', 'INFO');
    
    let confirmAlert = new Alert();
    confirmAlert.title = '日志已清除';
    confirmAlert.message = '所有日志记录已被删除。';
    confirmAlert.addAction('确定');
    await confirmAlert.presentAlert();
  } else {
    log('取消清除日志操作', 'INFO');
  }
}

async function showReport() {
  if (!fromUrlScheme && !isCancelled) {
    let alert = new Alert();
    let totalModules = report.success + report.fail.length + report.noUrl;
    
    alert.title = `📦 模块总数: ${totalModules}`;
    
    let messageComponents = [''];
    
    if (report.success > 0) {
      messageComponents.push(`✅ 模块更新成功: ${report.success}`, '');
      if (categoryUpdateResult) {
        messageComponents.push(categoryUpdateResult, '');
      }
    }
    
    if (report.fail.length > 0) {
      messageComponents.push(`❌ 模块更新失败: ${report.fail.length}`, '');
    }
    
    if (report.noUrl > 0) {
      messageComponents.push(`⚠️ 无链接: ${report.noUrl}`, '');
    }
    
    if (report.fail.length > 0) {
      messageComponents.push(`⚠️ 无效链接:`, report.fail.join('\n'), '');
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
}

async function reloadSurge() {
  const req = new Request('http://script.hub/reload');
  req.timeoutInterval = 10;
  req.method = 'GET';
  try {
    const startTime = Date.now();
    let res = await req.loadString();
    const responseTime = Date.now() - startTime;
    logNetworkRequest('http://script.hub/reload', 'GET', req.response.statusCode, responseTime);
    log("Surge 重载成功", 'INFO');
  } catch (error) {
    logError("Surge 重载失败", error);
  }
}

// 主程序
async function main() {
  logScriptExecution('START');
  log(`Surge 模块工具 v${ToolVersion} 启动`, 'INFO');
  
  try {
    if (args.queryParameters.openedFromButton === 'true') {
      isOpenedFromButton = true;
      logUserAction('Open script from button');
      await checkForUpdates();
    } else if (args.queryParameters.url) {
      fromUrlScheme = true;
      logUserAction('Create from link', { url: args.queryParameters.url, name: args.queryParameters.name });
      await createFromLink(args.queryParameters.url, args.queryParameters.name);
    } else {
      await showMainMenu();
    }

    if (isCancelled) {
      log("操作已取消", 'WARN');
      return;
    }

    await showReport();
  } catch (error) {
    logError("Script execution error", error);
  } finally {
    saveLogs();
    cleanupOldLogs();
    logScriptExecution('END');
  }
}

let report = {
  success: 0,
  fail: [],
  noUrl: 0,
};

let categoryUpdateResult = '';

// 运行主程序
try {
  await main();
  log("脚本执行完成", 'INFO');
} catch (error) {
  logError("脚本执行过程中发生错误", error);
}

if (isCancelled) {
  log("操作已取消", 'INFO');
}

// 确保脚本正确结束
Script.complete();