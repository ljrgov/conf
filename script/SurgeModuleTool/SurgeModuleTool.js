// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: green; icon-glyph: cloud-download-alt;

let ToolVersion = "1.1";

async function delay(milliseconds) {
  var before = Date.now();
  while (Date.now() < before + milliseconds) {}
  return true;
}

function convertToValidFileName(str) {
  const invalidCharsRegex = /[\/:*?"<>|]/g;
  const validFileName = str.replace(invalidCharsRegex, '_');
  const multipleDotsRegex = /\.{2,}/g;
  const fileNameWithoutMultipleDots = validFileName.replace(multipleDotsRegex, '.');
  const leadingTrailingDotsSpacesRegex = /^[\s.]+|[\s.]+$/g;
  return fileNameWithoutMultipleDots.replace(leadingTrailingDotsSpacesRegex, '');
}

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

function updateCategory(content, newCategory) {
  // 查找现有的 #!category 字段并替换，如果不存在则插入
  const categoryRegex = /^#!category\s*?=\s*?(.*?)\s*(\n|$)/im;
  if (categoryRegex.test(content)) {
    // 替换已有的 #!category
    return content.replace(categoryRegex, `#!category=${newCategory}\n`);
  } else {
    // 如果没有 #!category，则在文件头插入
    return addLineAfterLastOccurrence(content, `\n#!category=${newCategory}\n`);
  }
}

async function promptForCategory() {
  let alert = new Alert();
  alert.title = '设置模块分类';
  alert.addTextField('输入或选择分类', 'Default Category');
  alert.addAction('确定');
  alert.addCancelAction('取消');
  let idx = await alert.presentAlert();
  
  if (idx === -1) {
    return null; // 用户取消操作
  }
  return alert.textFieldValue(0); // 返回输入的分类
}

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
}

let folderPath;
let files = [];
let contents = [];
const fm = FileManager.iCloud();
if (idx == 3) {
  folderPath = await DocumentPicker.openFolder();
  files = fm.listContents(folderPath);
} else if (idx == 2) {
  const filePath = await DocumentPicker.openFile();
  folderPath = filePath.substring(0, filePath.lastIndexOf('/'));
  files = [filePath.substring(filePath.lastIndexOf('/') + 1)];
} else if (idx == 1) {
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
} else if (idx == 0) {
  console.log('检查更新');
  checkUpdate = true;
  await update();
}

let report = {
  success: 0,
  fail: [],
  noUrl: 0,
};

const selectedCategory = await promptForCategory(); // 获取用户输入的分类

for await (const [index, file] of files.entries()) {
  if (file && !/\.(conf|txt|js|list)$/i.test(file)) {
    let originalName, originalDesc, noUrl;
    try {
      let content;
      let filePath;
      if (contents.length > 0) {
        content = contents[index];
      } else {
        filePath = `${folderPath}/${file}`;
        content = fm.readString(filePath);
      }

      const matched = `${content}`.match(/^#SUBSCRIBED\s+(.*?)\s*(\n|$)/im);
      if (!matched) {
        noUrl = true;
        throw new Error('无订阅链接');
      }

      const url = matched[1];
      if (!url) {
        noUrl = true;
        throw new Error('无订阅链接');
      }

      let req = new Request(url);
      req.timeoutInterval = 10;
      req.method = 'GET';
      let res = await req.loadString();
      const statusCode = req.response.statusCode;
      if (statusCode < 200 || statusCode >= 400) {
        throw new Error(`statusCode: ${statusCode}`);
      }

      const nameMatched = `${res}`.match(/^#\!name\s*?=\s*?(.*?)\s*(\n|$)/im);
      if (!nameMatched) {
        throw new Error(`不是合法的模块内容`);
      }

      const name = nameMatched[1];
      const descMatched = `${res}`.match(/^#\!desc\s*?=\s*?(.*?)\s*(\n|$)/im);
      let desc = descMatched ? descMatched[1] : '';

      // 更新 #!category 字段
      res = updateCategory(res, selectedCategory || 'Default Category');
      res = addLineAfterLastOccurrence(res, `\n\n# 🔗 模块链接\n${url}\n`);

      content = res.replace(/^#\!desc\s*?=\s*/im, `#!desc=🔗 [${new Date().toLocaleString()}] `);
      
      if (filePath) {
        fm.writeString(filePath, content);
      } else {
        await DocumentPicker.exportString(content, file);
      }

      report.success += 1;
      await delay(1000);
    } catch (e) {
      if (noUrl) {
        report.noUrl += 1;
      } else {
        report.fail.push(originalName || file);
      }
    }
  }
}

if (!checkUpdate && !fromUrlScheme) {
  let alert = new Alert();
  let upErrk = report.fail.length > 0 ? `❌ 更新失败: ${report.fail.length}` : '';
  let noUrlErrk = report.noUrl > 0 ? `🈚️ 无链接: ${report.noUrl}` : '';
  alert.title = `📦 模块总数: ${report.success + report.fail.length + report.noUrl}`;
  alert.message = `${noUrlErrk}\n✅ 更新成功: ${report.success}\n${upErrk}${
    report.fail.length > 0 ? `\n${report.fail.join(', ')}` : ''
  }`;
  await alert.presentAlert();
}


// @key Think @wuhu.
async function update() {
  const fm = FileManager.iCloud()
  const dict = fm.documentsDirectory()
  // const scriptName = Script.name()
  const scriptName = 'SurgeModuleTool'
  let version
  let resp
  try {
    const url = 'https://raw.githubusercontent.com/ljrgov/conf/main/script/SurgeModuleTool/SurgeModuleTool.js?v=' + Date.now()
    let req = new Request(url)
    req.method = 'GET'
    req.headers = {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    }
    resp = await req.loadString()

    const regex = /let ToolVersion = "([\d.]+)"/
    const match = resp.match(regex)
    version = match ? match[1] : ''
  } catch (e) {
    console.error(e)
  }

  if (!version) {
    let alert = new Alert()
    alert.title = 'Surge 模块工具'
    alert.message = '无法获取在线版本'
    alert.addCancelAction('关闭')
    await alert.presentAlert()
    return
  } else {
    let needUpdate = version > ToolVersion
    if (!needUpdate) {
      let alert = new Alert()
      alert.title = 'Surge 模块工具'
      alert.message = `当前版本: ${ToolVersion}\n在线版本: ${version}\n无需更新`
      alert.addDestructiveAction('强制更新')
      alert.addCancelAction('关闭')
      idx = await alert.presentAlert()
      if (idx === 0) {
        needUpdate = true
      }
    }
    if (needUpdate) {
      fm.writeString(`${dict}/${scriptName}.js`, resp)
      console.log('更新成功: ' + version)
      let notification = new Notification()
      notification.title = 'Surge 模块工具 更新成功: ' + version
      notification.subtitle = '点击通知跳转'
      notification.sound = 'default'
      notification.openURL = `scriptable:///open/${scriptName}`
      notification.addAction('打开脚本', `scriptable:///open/${scriptName}`, false)
      await notification.schedule()
    }
  }
}