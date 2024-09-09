// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: cloud-download-alt;

// prettier-ignore
let ToolVersion = "1.2";

// 辅助函数：延迟执行
async function delay(milliseconds) {
  var before = Date.now();
  while (Date.now() < before + milliseconds) {}
  return true;
}

// 辅助函数：转换为有效的文件名
function convertToValidFileName(str) {
  const invalidCharsRegex = /[\/:*?"<>|]/g;
  const validFileName = str.replace(invalidCharsRegex, '_');
  const multipleDotsRegex = /\.{2,}/g;
  const fileNameWithoutMultipleDots = validFileName.replace(multipleDotsRegex, '.');
  const leadingTrailingDotsSpacesRegex = /^[\s.]+|[\s.]+$/g;
  const finalFileName = fileNameWithoutMultipleDots.replace(leadingTrailingDotsSpacesRegex, '');
  return finalFileName;
}

// 辅助函数：在最后一次匹配后添加新行
function addLineAfterLastOccurrence(text, addition) {
  const regex = /^#!.+?$/gm;
  const matchArray = text.match(regex);
  const lastIndex = matchArray ? matchArray.length - 1 : -1;
  if (lastIndex >= 0) {
    const lastMatch = matchArray[lastIndex];
    const insertIndex = text.indexOf(lastMatch) + lastMatch.length;
    return text.slice(0, insertIndex) + addition + text.slice(insertIndex);
  }
  return text;
}

// 辅助函数：显示分类选择对话框
async function showCategoryDialog(currentCategory) {
  const categories = ['📕广告模块', '📗功能模块', '📘面板模块', '📚默认分类'];
  const alert = new Alert();
  alert.title = '选择分类';
  categories.forEach(category => alert.addAction(category));
  alert.addCancelAction('取消');

  const idx = await alert.presentAlert();
  if (idx === -1) return currentCategory; // 取消按钮被点击，返回当前分类

  const selectedCategory = categories[idx];
  return selectedCategory === '📚默认分类' ? currentCategory : selectedCategory;
}

// 辅助函数：处理文件内容
async function processFile(filePath, content) {
  try {
    // 提取 name 和 desc
    const nameMatch = content.match(/^#!name\s*?=\s*(.*?)\s*(\n|$)/im);
    const descMatch = content.match(/^#!desc\s*?=\s*(.*?)\s*(\n|$)/im);
    const categoryMatch = content.match(/^#!category\s*?=\s*(.*?)\s*(\n|$)/im);

    let name = nameMatch ? nameMatch[1] : 'Untitled';
    let desc = descMatch ? descMatch[1] : '';
    let category = categoryMatch ? categoryMatch[1] : '📚未分类';
    let originalCategory = category;

    const fm = FileManager.iCloud();

    // 如果已有 category，则替换为“📚未分类”
    if (categoryMatch) {
      content = content.replace(/^#!category\s*?=\s*(.*?)\s*(\n|$)/im, `#!category=📚未分类\n`);
      category = '📚未分类';
    } else {
      // 如果没有 category，则在第三行添加
      const lines = content.split('\n');
      if (lines.length < 2) {
        // 如果文件内容少于2行，直接添加
        content += `\n#!category=📚未分类\n`;
      } else {
        // 在第三行添加
        lines.splice(2, 0, `#!category=📚未分类`);
        content = lines.join('\n');
      }
    }

    // 弹出分类选择对话框
    category = await showCategoryDialog(category);
    if (category !== originalCategory) {
      // 更新 category
      content = content.replace(/^#!category\s*?=\s*(.*?)\s*(\n|$)/im, `#!category=${category}\n`);
    }

    // 从 #SUBSCRIBED 中提取 URL 并请求模块内容
    const urlMatch = content.match(/^#SUBSCRIBED\s+(.*?)\s*(\n|$)/im);
    if (!urlMatch) {
      throw new Error('无订阅链接');
    }
    const url = urlMatch[1];

    const req = new Request(url);
    req.timeoutInterval = 10;
    req.method = 'GET';
    let res = await req.loadString();
    const statusCode = req.response.statusCode;
    if (statusCode < 200 || statusCode >= 400) {
      throw new Error(`statusCode: ${statusCode}`);
    }
    if (!res) {
      throw new Error('未获取到模块内容');
    }

    const nameMatched = res.match(/^#!name\s*?=\s*(.*?)\s*(\n|$)/im);
    if (!nameMatched) {
      throw new Error('不是合法的模块内容');
    }
    name = nameMatched[1];
    const descMatched = res.match(/^#!desc\s*?=\s*(.*?)\s*(\n|$)/im);
    desc = descMatched ? descMatched[1] : '';

    if (!desc) {
      res = `#!desc=\n${res}`;
    }
    res = res.replace(/^(#SUBSCRIBED|# 🔗 模块链接)(.*?)(\n|$)/gim, '');
    res = addLineAfterLastOccurrence(res, `\n\n# 🔗 模块链接\n${urlMatch[0].replace(/\n/g, '')}\n`);
    content = `${res}`.replace(/^#!desc\s*?=\s*/im, `#!desc=🔗 [${new Date().toLocaleString()}] `);

    fm.writeString(filePath, content);

    let nameInfo = `${name}`;
    let descInfo = `${desc}`;
    let categoryInfo = originalCategory === category ? '默认不变' : `更新为 ${category}`;

    console.log(`\n✅ ${nameInfo}\n${descInfo}\n分类: ${categoryInfo}\n${filePath}`);
    report.success += 1;
    await delay(1 * 1000);

    // 从 URL Scheme 模式显示结果对话框
    if (fromUrlScheme) {
      const resultAlert = new Alert();
      resultAlert.title = `✅ ${nameInfo}`;
      resultAlert.message = `${descInfo}\n分类: ${categoryInfo}\n${filePath}`;
      resultAlert.addDestructiveAction('重载 Surge');
      resultAlert.addAction('打开 Surge');
      resultAlert.addCancelAction('关闭');
      const idx = await resultAlert.presentAlert();
      if (idx === 0) {
        const reloadReq = new Request('http://script.hub/reload');
        reloadReq.timeoutInterval = 10;
        reloadReq.method = 'GET';
        await reloadReq.loadString();
      } else if (idx === 1) {
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
}

// 主逻辑：选择模式和处理文件
let idx;
let fromUrlScheme;
let checkUpdate;
if (args.queryParameters.url) {
  fromUrlScheme = true;
}
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
  if (idx === -1) return; // 取消按钮被点击，退出脚本
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
    let alert = new Alert();
    alert.title = '将自动添加后缀 .sgmodule';
    alert.addTextField('链接(必填)', '');
    alert.addTextField('名称(选填)', '');
    alert.addAction('下载');
    alert.addCancelAction('取消');
    const response = await alert.presentAlert();
    if (response === -1) return; // 取消按钮被点击，退出脚本
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

// 处理每个文件
let report = {
  success: 0,
  fail: [],
  noUrl: 0
};

for await (const file of files) {
  if (file && !/\.(conf|txt|js|list)$/i.test(file)) {
    let filePath = `${folderPath}/${file}`;
    let content = fm.readString(filePath);
    await processFile(filePath, content);
  }
}

// 最终报告
if (!checkUpdate && !fromUrlScheme) {
  const alert = new Alert();
  let upErrk = report.fail.length > 0 ? `❌ 更新失败: ${report.fail.length}` : '';
  let noUrlErrk = report.noUrl > 0 ? `🈚️ 无链接: ${report.noUrl}` : '';
  alert.title = `📦 模块总数: ${report.success + report.fail.length + report.noUrl}`;
  alert.message = `${noUrlErrk}\n✅ 更新成功: ${report.success}\n${upErrk}${report.fail.length > 0 ? `\n${report.fail.join(', ')}` : ''}`;
  alert.addDestructiveAction('重载 Surge');
  alert.addAction('打开 Surge');
  alert.addCancelAction('关闭');
  const finalIdx = await alert.presentAlert();
  if (finalIdx === 0) {
    const reloadReq = new Request('http://script.hub/reload');
    reloadReq.timeoutInterval = 10;
    reloadReq.method = 'GET';
    await reloadReq.loadString();
  } else if (finalIdx === 1) {
    Safari.open('surge://');
  }
}

async function update() {
  const fm = FileManager.iCloud();
  const dict = fm.documentsDirectory();
  // const scriptName = Script.name()
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



