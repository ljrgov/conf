// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: cloud-download-alt;

// prettier-ignore
const ToolVersion = "1.0";

// Helper function: delay execution
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Helper function: convert to valid filename
const convertToValidFileName = str => str
  .replace(/[\/:*?"<>|]/g, '_')
  .replace(/\.{2,}/g, '.')
  .trim();

// Helper function: add line after last occurrence
const addLineAfterLastOccurrence = (text, addition) => {
  const regex = /^#!.+?$/gm;
  const matches = [...text.matchAll(regex)];
  const lastMatch = matches[matches.length - 1];
  
  if (lastMatch) {
    const insertIndex = lastMatch.index + lastMatch[0].length;
    return text.slice(0, insertIndex) + addition + text.slice(insertIndex);
  }
  
  return text;
};

// Helper function: show category dialog
const showCategoryDialog = async (currentCategory) => {
  const categories = ['📕广告模块', '📗功能模块', '📘面板模块', '📚默认不变'];
  const alert = new Alert();
  alert.title = '选择分类';
  categories.forEach(category => alert.addAction(category));
  alert.addCancelAction('取消');

  const idx = await alert.presentAlert();
  return categories[idx] === '📚默认不变' ? currentCategory : categories[idx];
};

// Helper function: process file content
const processFile = async (filePath, content) => {
  try {
    const nameMatch = content.match(/^#\!name\s*?=\s*(.*?)\s*(\n|$)/im);
    const descMatch = content.match(/^#\!desc\s*?=\s*(.*?)\s*(\n|$)/im);
    const categoryMatch = content.match(/^#\!category\s*?=\s*(.*?)\s*(\n|$)/im);

    let name = nameMatch ? nameMatch[1] : 'Untitled';
    let desc = descMatch ? descMatch[1] : '';
    let category = categoryMatch ? categoryMatch[1] : '📚未分类';
    const originalCategory = category;

    // Handle category
    category = await showCategoryDialog(category);
    content = categoryMatch 
      ? content.replace(/^#\!category\s*?=\s*(.*?)\s*(\n|$)/im, `#!category=${category}\n`)
      : content + `#!category=${category}\n`;

    // Extract URL from #SUBSCRIBED and fetch module content
    const urlMatch = content.match(/^#SUBSCRIBED\s+(.*?)\s*(\n|$)/im);
    if (!urlMatch) throw new Error('无订阅链接');
    
    const url = urlMatch[1];
    const req = new Request(url);
    req.timeoutInterval = 10;
    req.method = 'GET';
    
    let res = await req.loadString();
    if (req.response.statusCode < 200 || req.response.statusCode >= 400) 
      throw new Error(`HTTP 错误: ${req.response.statusCode}`);
    if (!res) throw new Error('未获取到模块内容');

    const nameMatched = res.match(/^#\!name\s*?=\s*(.*?)\s*(\n|$)/im);
    if (!nameMatched) throw new Error('不是合法的模块内容');
    
    name = nameMatched[1];
    const descMatched = res.match(/^#\!desc\s*?=\s*(.*?)\s*(\n|$)/im);
    desc = descMatched ? descMatched[1] : '';

    if (!desc) res = `#!desc=\n${res}`;
    res = res.replace(/^(#SUBSCRIBED|# 🔗 模块链接)(.*?)(\n|$)/gim, '');
    res = addLineAfterLastOccurrence(res, `\n\n# 🔗 模块链接\n${urlMatch[0].trim()}\n`);
    content = `${res}`.replace(/^#\!desc\s*?=\s*/im, `#!desc=🔗 [${new Date().toLocaleString()}] `);
    
    const fm = FileManager.iCloud();
    fm.writeString(filePath, content);

    const categoryInfo = originalCategory === category ? '默认不变' : `更新为 ${category}`;
    console.log(`\n✅ ${name}\n${desc}\n分类: ${categoryInfo}\n${filePath}`);
    report.success += 1;
    await delay(1000);
    
    if (fromUrlScheme) {
      const resultAlert = new Alert();
      resultAlert.title = `✅ ${name}`;
      resultAlert.message = `${desc}\n分类: ${categoryInfo}\n${filePath}`;
      resultAlert.addDestructiveAction('重载 Surge');
      resultAlert.addAction('打开 Surge');
      resultAlert.addCancelAction('关闭');
      const idx = await resultAlert.presentAlert();
      if (idx == 0) {
        const req = new Request('http://script.hub/reload');
        req.timeoutInterval = 10;
        req.method = 'GET';
        await req.loadString();
      } else if (idx == 1) {
        Safari.open('surge://');
      }
    }
  } catch (e) {
    if (e.message === '无订阅链接') {
      report.noUrl += 1;
    } else {
      report.fail.push(filePath);
    }

    if (fromUrlScheme) {
      const errorAlert = new Alert();
      errorAlert.title = `❌ ${filePath}`;
      errorAlert.message = `${e.message || e}`;
      errorAlert.addCancelAction('关闭');
      await errorAlert.presentAlert();
    } else {
      console.error(`${filePath}: ${e}`);
    }
  }
};

// Main logic: choose mode and process files
let idx;
let fromUrlScheme;
let checkUpdate;
if (args.queryParameters.url) {
  fromUrlScheme = true;
  idx = 1;
} else {
  const alert = new Alert();
  alert.title = 'Surge 模块工具';
  alert.addDestructiveAction('更新本脚本');
  alert.addAction('从链接创建');
  alert.addAction('更新单个模块');
  alert.addAction('更新全部模块');
  alert.addCancelAction('取消');
  idx = await alert.presentAlert();
}

let folderPath;
let files = [];
let contents = [];
const fm = FileManager.iCloud();
if (idx === 3) {
  folderPath = await DocumentPicker.openFolder();
  files = fm.listContents(folderPath);
} else if (idx === 2) {
  const filePath = await DocumentPicker.openFile();
  folderPath = filePath.substring(0, filePath.lastIndexOf('/'));
  files = [filePath.substring(filePath.lastIndexOf('/') + 1)];
} else if (idx === 1) {
  let url;
  let name;
  if (fromUrlScheme) {
    url = args.queryParameters.url;
    name = args.queryParameters.name;
  } else {
    const alert = new Alert();
    alert.title = '将自动添加后缀 .sgmodule';
    alert.addTextField('链接(必填)', '');
    alert.addTextField('名称(选填)', '');
    alert.addAction('下载');
    alert.addCancelAction('取消');
    await alert.presentAlert();
    url = alert.textFieldValue(0);
    name = alert.textFieldValue(1);
  }
  if (url) {
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
  }
} else if (idx === 0) {
  console.log('检查更新');
  checkUpdate = true;
  await update();
}

// Process each file
const report = {
  success: 0,
  fail: [],
  noUrl: 0
};

for (const file of files) {
  if (file && !/\.(conf|txt|js|list)$/i.test(file)) {
    const filePath = `${folderPath}/${file}`;
    const content = fm.readString(filePath);
    await processFile(filePath, content);
  }
}

// Final report
if (!checkUpdate && !fromUrlScheme) {
  const alert = new Alert();
  const upErrk = report.fail.length > 0 ? `❌更新失败: ${report.fail.length}` : '';
  const noUrlErrk = report.noUrl > 0 ? `⚠️无链接: ${report.noUrl}` : '';
  alert.title = `📦 模块总数: ${report.success + report.fail.length + report.noUrl}`;
  alert.message = `${noUrlErrk}\n✅更新成功: ${report.success}\n${upErrk}${report.fail.length > 0 ? `\n${report.fail.join(', ')}` : ''}`;
  alert.addDestructiveAction('重载 Surge');
  alert.addAction('打开 Surge');
  alert.addCancelAction('关闭');
  const idx = await alert.presentAlert();
  if (idx === 0) {
    const req = new Request('http://script.hub/reload');
    req.timeoutInterval = 10;
    req.method = 'GET';
    await req.loadString();
  } else if (idx === 1) {
    Safari.open('surge://');
  }
}

const update = async () => {
  const fm = FileManager.iCloud();
  const dict = fm.documentsDirectory();
  const scriptName = 'SurgeModuleTool';
  
  try {
    const url = `https://raw.githubusercontent.com/ljrgov/conf/main/script/SurgeModuleTool/SurgeModuleTool.js?v=${Date.now()}`;
    const req = new Request(url);
    req.method = 'GET';
    req.headers = {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    };
    
    const resp = await req.loadString();
    const regex = /let ToolVersion = "([\d.]+)"/;
    const match = resp.match(regex);
    const version = match ? match[1] : '';

    if (!version) throw new Error('无法获取在线版本');

    let needUpdate = version > ToolVersion;
    if (!needUpdate) {
      const alert = new Alert();
      alert.title = 'Surge 模块工具';
      alert.message = `当前版本: ${ToolVersion}\n在线版本: ${version}\n无需更新`;
      alert.addDestructiveAction('强制更新');
      alert.addCancelAction('关闭');
      const idx = await alert.presentAlert();
      needUpdate = idx === 0;
    }

    if (needUpdate) {
      fm.writeString(`${dict}/${scriptName}.js`, resp);
      console.log('更新成功: ' + version);
      const notification = new Notification();
      notification.title = `Surge 模块工具 更新成功: ${version}`;
      notification.subtitle = '点击通知跳转';
      notification.sound = 'default';
      notification.openURL = `scriptable:///open/${scriptName}`;
      notification.addAction('打开脚本', `scriptable:///open/${scriptName}`, false);
      await notification.schedule();
    }
  } catch (e) {
    console.error(e);
    const alert = new Alert();
    alert.title = 'Surge 模块工具';
    alert.message = '无法更新脚本';
    alert.addCancelAction('关闭');
    await alert.presentAlert();
  }
};


