// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: green; icon-glyph: cloud-download-alt;

// prettier-ignore
let ToolVersion = "2.9";

async function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function convertToValidFileName(str) {
  return str
    .replace(/[\/:*?"<>|]/g, '_')
    .replace(/\.{2,}/g, '.')
    .trim()
    .replace(/^[.]+|[.]+$/g, '');
}

function addLineAfterLastOccurrence(text, addition) {
  const regex = /^#!.+?$/gm;
  const matchArray = text.match(regex);
  if (matchArray) {
    const lastMatch = matchArray[matchArray.length - 1];
    const insertIndex = text.lastIndexOf(lastMatch) + lastMatch.length;
    return text.slice(0, insertIndex) + addition + text.slice(insertIndex);
  }
  return text + addition;
}

async function selectFile() {
  const filePath = await DocumentPicker.openFile();
  if (!filePath) {
    console.log('未选择文件，退出操作');
    return null;
  }
  return filePath;
}

async function selectFolder() {
  const folderPath = await DocumentPicker.openFolder();
  if (!folderPath) {
    console.log('未选择文件夹，退出操作');
    return null;
  }
  return folderPath;
}

async function showAlert(title, message, actions) {
  let alert = new Alert();
  alert.title = title;
  alert.message = message;
  actions.forEach(action => alert.addAction(action));
  alert.addCancelAction('取消');
  return await alert.presentAlert();
}

// 主代码逻辑
let idx = -1;
let fromUrlScheme = !!args.queryParameters.url;
let checkUpdate = false;
let filePath, folderPath;
let files = [];
let contents = [];
const fm = FileManager.iCloud();

if (fromUrlScheme) {
  idx = 1;
} else {
  idx = await showAlert('Surge 模块工具', '', [
    '更新本脚本',
    '从链接创建',
    '更新单个模块',
    '更新全部模块'
  ]);
}

if (idx === -1) return;

if (idx == 0) {
  console.log('检查更新');
  checkUpdate = true;
  await update();  // 确保 update() 已定义
  return;
}

if (idx == 1) {
  let url, name;
  if (fromUrlScheme) {
    url = args.queryParameters.url;
    name = args.queryParameters.name;
  } else {
    const inputIdx = await showAlert('将自动添加后缀 .sgmodule', '', [
      '下载'
    ]);
    if (inputIdx === -1) return;

    url = prompt('链接(必填)');
    name = prompt('名称(选填)');
  }

  if (url) {
    name = name || url.split('?')[0].split('/').pop().replace(/\.sgmodule$/, '') || `untitled-${new Date().toLocaleString()}`;
    name = convertToValidFileName(name);

    folderPath = await selectFolder();
    if (!folderPath) return;

    try {
      const req = new Request(url);
      req.timeoutInterval = 30;
      const fileContent = await req.loadString();
      if (!fileContent) throw new Error('下载内容为空');

      const filePath = `${folderPath}/${name}.sgmodule`;
      fm.writeString(filePath, fileContent);
      files = [`${name}.sgmodule`];
      contents = [fileContent];
    } catch (err) {
      console.log(`下载失败: ${err.message}`);
      return;
    }
  }
} else if (idx == 2) {
  filePath = await selectFile();
  if (!filePath) return;
  folderPath = filePath.substring(0, filePath.lastIndexOf('/'));
  files = [filePath.substring(filePath.lastIndexOf('/') + 1)];
} else if (idx == 3) {
  folderPath = await selectFolder();
  if (!folderPath) return;
  files = fm.listContents(folderPath).filter(file => /\.(conf|txt|js|list)$/i.test(file));
}

let report = {
  success: 0,
  fail: [],
  noUrl: 0,
};
let categoryReplaceSuccess = 0;
let categoryKeepDefaultCount = 0;
let categoryReplaceFail = 0;

for await (const [index, file] of files.entries()) {
  if (file && /\.(conf|txt|js|list)$/i.test(file)) {
    let originalName, originalDesc, originalCategory, noUrl;

    try {
      let content = contents.length > 0 ? contents[index] : fm.readString(`${folderPath}/${file}`);
      const originalNameMatched = content.match(/^#!name\s*?=\s*(.*?)\s*(\n|$)/im);
      if (originalNameMatched) originalName = originalNameMatched[1];
      const originalDescMatched = content.match(/^#!desc\s*?=\s*(.*?)\s*(\n|$)/im);
      if (originalDescMatched) originalDesc = originalDescMatched[1].replace(/^🔗.*?]\s*/i, '');
      
      let originalCategoryMatched = content.match(/^#!category\s*?=\s*(.*?)\s*(\n|$)/im);
      let originalCategory = originalCategoryMatched ? originalCategoryMatched[1] : null;

      if (!originalCategory) {
        const lines = content.split('\n');
        if (lines.length >= 2) {
          lines.splice(2, 0, '#!category=📚未分类');
          content = lines.join('\n');
          originalCategory = '📚未分类';
        } else {
          content = `#!category=📚未分类\n${content}`;
          originalCategory = '📚未分类';
        }
      }

      const categoryIdx = await showAlert('选择新的分类', `当前分类: ${originalCategory}`, [
        '📕去广告模块',
        '📘功能模块',
        '📗面板模块',
        '📚默认不变'
      ]);

      let category = originalCategory;
      switch (categoryIdx) {
        case 0:
          category = '📕去广告模块';
          break;
        case 1:
          category = '📘功能模块';
          break;
        case 2:
          category = '📗面板模块';
          break;
        case 3:
          categoryKeepDefaultCount += 1;
          break;
        default:
          category = originalCategory;
          break;
      }

      if (category !== originalCategory) {
        if (content.match(/^#!category\s*?=.*(\n|$)/im)) {
          content = content.replace(/^#!category\s*?=.*(\n|$)/im, `#!category=${category}$1`);
          categoryReplaceSuccess += 1;
        } else {
          content = addLineAfterLastOccurrence(content, `\n#!category=${category}`);
          categoryReplaceFail += 1;
        }
      }

      if (filePath) {
        fm.writeString(filePath, content);
      }

      report.success += 1;
    } catch (error) {
      console.log(`处理模块 ${file} 时出错: ${error.message}`);
      if (noUrl) {
        report.noUrl += 1;
      } else {
        report.fail.push(`${file}: ${error.message}`);
      }
    }
  }
}

if (!checkUpdate && !fromUrlScheme) {
  const resultMessage = [
    categoryReplaceSuccess > 0 ? `📚 类别替换成功: ${categoryReplaceSuccess}` : '',
    categoryKeepDefaultCount > 0 ? `📚 类别保持默认: ${categoryKeepDefaultCount}` : '',
    categoryReplaceFail > 0 ? `📚 类别替换失败: ${categoryReplaceFail}` : '',
    report.fail.length > 0 ? `❌ 模块更新失败: ${report.fail.length}` : '',
    report.noUrl > 0 ? `⚠️ 无链接: ${report.noUrl}` : ''
  ].filter(Boolean).join('\n');

  const alertIdx = await showAlert(`📦 处理模块总数: ${report.success + report.fail.length + report.noUrl}`, resultMessage, [
    '重载 Surge',
    '打开 Surge',
    '关闭'
  ]);

  if (alertIdx == 0) {
    const req = new Request('http://script.hub/reload');
    req.timeoutInterval = 10;
    await req.loadString();
  } else if (alertIdx == 1) {
    Safari.open('surge://');
  }
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


