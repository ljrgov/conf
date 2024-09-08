// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: cloud-download-alt;

// prettier-ignore
let ToolVersion = "3.0.7";

// 使用 Promise 实现延迟，而不是手动循环
async function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function convertToValidFileName(str) {
  return str
    .replace(/[\/:*?"<>|]/g, '_') // 替换非法字符
    .replace(/\.{2,}/g, '.') // 删除多余的点号
    .replace(/^[\s.]+|[\s.]+$/g, ''); // 删除开头和结尾的点号和空格
}

function addLineAfterLastOccurrence(text, addition) {
  const lines = text.split('\n');
  const lastLineIndex = lines.findLastIndex(line => line.startsWith('#!'));
  if (lastLineIndex !== -1) {
    lines.splice(lastLineIndex + 1, 0, addition);
    return lines.join('\n');
  }
  return text;
}

// UI 提示更新函数
async function updateProgress(totalFiles, report) {
  let progressAlert = new Alert();
  progressAlert.title = '正在处理文件...';
  progressAlert.message = `已处理 ${report.success}/${totalFiles} 个文件`;
  progressAlert.addCancelAction('取消');

  let isCancelled = false;

  // 函数用于轮询更新消息
  async function pollProgress() {
    while (!isCancelled) {
      progressAlert.message = `已处理 ${report.success}/${totalFiles} 个文件`;
      await delay(1000); // 每秒更新一次
    }
  }

  // 启动轮询进程
  let pollPromise = pollProgress();

  let cancel = await progressAlert.presentAlert();
  if (cancel === -1) {
    isCancelled = true;
  }

  // 等待轮询结束
  await pollPromise;

  return isCancelled;
}

// 更新逻辑
async function update() {
  const fm = FileManager.iCloud();
  const dict = fm.documentsDirectory();
  const scriptName = 'SurgeModuleTool';
  let version;
  let resp;

  try {
    const url = `https://raw.githubusercontent.com/ljrgov/conf/main/script/SurgeModuleTool/SurgeModuleTool.js?v=${Date.now()}`;
    let req = new Request(url);
    req.method = 'GET';
    req.headers = { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' };
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
    console.log(`更新成功: ${version}`);
    let notification = new Notification();
    notification.title = `Surge 模块工具 更新成功: ${version}`;
    notification.subtitle = '点击通知跳转';
    notification.sound = 'default';
    notification.openURL = `scriptable:///open/${scriptName}`;
    notification.addAction('打开脚本', `scriptable:///open/${scriptName}`, false);
    await notification.schedule();
  }
}

// 处理文件并发逻辑
async function processFilesConcurrently(files) {
  let tasks = files.map(async (file, index) => {
    try {
      if (isCancelled) return;

      if (file && !/\.(conf|txt|js|list)$/i.test(file)) {
        let originalCategory;
        let noUrl = false;
        let originalName, originalDesc;
        
        let content, filePath;

        if (contents.length > 0) {
          content = contents[index];
        } else {
          filePath = `${folderPath}/${file}`;
          content = fm.readString(filePath);
        }

        // 提取原始名称和描述
        const originalNameMatched = content.match(/^#\!name\s*?=\s*(.*?)\s*(\n|$)/im);
        if (originalNameMatched) originalName = originalNameMatched[1];

        const originalDescMatched = content.match(/^#\!desc\s*?=\s*(.*?)\s*(\n|$)/im);
        if (originalDescMatched) {
          originalDesc = originalDescMatched[1].replace(/^🔗.*?]\s*/i, '');
        }

        // 检查是否有订阅链接
        const matched = content.match(/^#SUBSCRIBED\s+(.*?)\s*(\n|$)/im);
        if (!matched) throw new Error('无订阅链接');
        
        const url = matched[1];
        if (!url) throw new Error('无订阅链接');

        // 执行请求，获取远程内容
        const req = new Request(url);
        req.timeoutInterval = 10;
        req.method = 'GET';
        let res = await req.loadString();
        if (req.response.statusCode < 200 || req.response.statusCode >= 400) {
          throw new Error(`HTTP 错误状态码: ${req.response.statusCode}`);
        }

        // 处理模块的名称和描述
        const nameMatched = res.match(/^#\!name\s*?=\s*(.*?)\s*(\n|$)/im);
        if (!nameMatched) throw new Error('无效模块');
        const name = nameMatched[1];
        const descMatched = res.match(/^#\!desc\s*?=\s*(.*?)\s*(\n|$)/im);
        let desc = descMatched ? descMatched[1] : '';

        if (!desc) res = `#!desc=\n${res}`;

        // 更新分类
        let categoryMatched = content.match(/^#\!category\s*?=\s*(.*?)\s*(\n|$)/im);
        originalCategory = categoryMatched ? categoryMatched[1] : '未分类';

        if (!categoryMatched) {
          content = `#!category=${selectedCategory}\n${content}`;
        } else if (selectedCategory !== originalCategory) {
          content = content.replace(/^#\!category\s*?=\s*(.*?)\s*(\n|$)/im, `#!category=${selectedCategory}\n`);
          categoryChangedCount++;
          categoryChangeInfo = `分类变更: ${originalCategory} -> ${selectedCategory}`;
        }

        if (filePath) {
          fm.writeString(filePath, content);
        } else {
          await DocumentPicker.exportString(content, file);
        }

        console.log(`✅ 处理成功: ${name} | 文件: ${file}`);
        report.success++;
        await delay(1000);
      }
    } catch (e) {
      console.error(`❌ 文件处理失败: ${file} | 错误: ${e}`);
      report.fail.push(file);
    }
  });

  await Promise.all(tasks);
}

// 主处理逻辑
let idx;
let fromUrlScheme = args.queryParameters.url;
let checkUpdate;
let folderPath;
let files = [];
let contents = [];
const fm = FileManager.iCloud();
let report = { success: 0, fail: [], noUrl: 0 };
let categoryChangeInfo = '';
let categoryChangedCount = 0;
let isCancelled = false;

if (fromUrlScheme) {
  idx = 1;
} else {
  let alert = new Alert();
  alert.title = 'Surge 模块工具';
  alert.addDestructiveAction('更新本脚本');
  alert.addAction('从链接创建');
  alert.addAction('更新单个模块');
  alert.addAction('更新全部模块');
  alert.addCancelAction('取消');
  idx = await alert.presentAlert();
}

if (idx === 3) {
  folderPath = await DocumentPicker.openFolder();
  files = fm.listContents(folderPath);
} else if (idx === 2) {
  const filePath = await DocumentPicker.openFile();
  folderPath = filePath.substring(0, filePath.lastIndexOf('/'));
  files = [filePath.substring(filePath.lastIndexOf('/') + 1)];
} else if (idx === 1) {
  let url = fromUrlScheme ? args.queryParameters.url : null;
  let name = fromUrlScheme ? args.queryParameters.name : null;

  if (!url) {
    let alert = new Alert();
    alert.title = '将自动添加后缀 .sgmodule';
    alert.addTextField('链接(必填)', '');
    alert.addTextField('名称(选填)', '');
    await alert.presentAlert();
    url = alert.textFieldValue(0);
    name = alert.textFieldValue(1);
  }

  if (url) {
    name = name || url.split('?')[0].split('/').pop().replace(/\.sgmodule$/, '') || `untitled-${new Date().toLocaleString()}`;
    name = convertToValidFileName(name);
    files = [`${name}.sgmodule`];
    contents = [`#SUBSCRIBED ${url}`];
  }
} else if (idx === 0) {
  checkUpdate = await update();
}

let categoryAlert = new Alert();
categoryAlert.title = '选择模块分类';
categoryAlert.addAction('去广告');
categoryAlert.addAction('功能模块');
categoryAlert.addAction('面板模块');
categoryAlert.addCancelAction('取消');
let categoryIdx = await categoryAlert.presentAlert();
let selectedCategory = ['去广告', '功能模块', '面板模块'][categoryIdx] || '未分类';

if (files.length) {
  isCancelled = await updateProgress(files.length, report);
  if (!isCancelled) {
    await processFilesConcurrently(files);
    
    let resultAlert = new Alert();
    let upErrk = report.fail.length > 0 ? `❌ 更新失败: ${report.fail.length}` : '';
    let noUrlErrk = report.noUrl > 0 ? `🈚️ 无链接: ${report.noUrl}` : '';
    resultAlert.title = `📦 模块总数: ${report.success + report.fail.length + report.noUrl}`;
    resultAlert.message = `${noUrlErrk}\n✅ 更新成功: ${report.success}\n${categoryChangeInfo}\n${upErrk}${report.fail.length > 0 ? `\n${report.fail.join(', ')}` : ''}`;
    resultAlert.addDestructiveAction('重载 Surge');
    resultAlert.addAction('打开 Surge');
    resultAlert.addCancelAction('关闭');

    let idx = await resultAlert.presentAlert();
    if (idx === 0) {
      const req = new Request('http://script.hub/reload');
      req.timeoutInterval = 10;
      req.method = 'GET';
      await req.loadString();
    } else if (idx === 1) {
      Safari.open('surge://');
    }
  }
}






