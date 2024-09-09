// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: green; icon-glyph: cloud-download-alt;

// prettier-ignore
let ToolVersion = "2.9";

// 延时函数
async function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

// 转换为合法的文件名
function convertToValidFileName(str) {
  const invalidCharsRegex = /[\/:*?"<>|]/g;
  let validFileName = str.replace(invalidCharsRegex, '_');
  validFileName = validFileName.replace(/\.{2,}/g, '.');
  validFileName = validFileName.trim().replace(/^[.]+|[.]+$/g, '');
  return validFileName;
}

// 在最后一个匹配项后添加新行
function addLineAfterLastOccurrence(text, addition) {
  const regex = /^#!.+?$/gm;
  const matchArray = text.match(regex);
  if (matchArray && matchArray.length > 0) {
    const lastMatch = matchArray[matchArray.length - 1];
    const insertIndex = text.lastIndexOf(lastMatch) + lastMatch.length;
    return text.slice(0, insertIndex) + addition + text.slice(insertIndex);
  }
  return text + addition;
}

// 选择文件的函数
async function selectFile() {
  const filePath = await DocumentPicker.openFile();
  if (!filePath) {
    console.log('未选择文件，退出操作');
    return null;
  }
  return filePath;
}

// 选择文件夹的函数
async function selectFolder() {
  const folderPath = await DocumentPicker.openFolder();
  if (!folderPath) {
    console.log('未选择文件夹，退出操作');
    return null;
  }
  return folderPath;
}

// 显示结果对话框
async function showResultAlert(report, categoryReplaceSuccess, categoryKeepDefaultCount, categoryReplaceFail) {
  const upErrk = report.fail.length > 0 ? `❌ 模块更新失败: ${report.fail.length}` : '';
  const noUrlErrk = report.noUrl > 0 ? `⚠️ 无链接: ${report.noUrl}` : '';
  const categoryReplaceInfo = categoryReplaceSuccess > 0 ? `📁 分类替换成功: ${categoryReplaceSuccess}` : '';
  const categoryKeepDefaultInfo = categoryKeepDefaultCount > 0 ? `📁 分类保持默认: ${categoryKeepDefaultCount}` : '';
  const categoryReplaceFailInfo = categoryReplaceFail > 0 ? `📁 分类替换失败: ${categoryReplaceFail}` : '';

  let alert = new Alert();
  alert.title = '📦 模块处理完成';
  alert.message = `
    ✅ 成功: ${report.success}
    ${upErrk}
    ${noUrlErrk}
    ${categoryReplaceInfo}
    ${categoryKeepDefaultInfo}
    ${categoryReplaceFailInfo}
  `.trim();
  alert.addAction('重载 Surge');
  alert.addAction('打开 Surge');
  alert.addCancelAction('关闭');

  const idx = await alert.presentAlert();
  return idx;
}

// 主逻辑
let idx;
let fromUrlScheme = !!args.queryParameters.url;
let checkUpdate = false;
let filePath;
let folderPath;
let files = [];
let contents = [];
const fm = FileManager.iCloud();

// 从 URL scheme 启动
if (fromUrlScheme) {
  idx = 1;
} else {
  let alert = new Alert();
  alert.title = 'Surge 模块工具';
  alert.addDestructiveAction('更新本脚本');  // idx = 0
  alert.addAction('从链接创建');            // idx = 1
  alert.addAction('更新单个模块');          // idx = 2
  alert.addAction('更新全部模块');          // idx = 3
  alert.addCancelAction('取消');
  
  idx = await alert.presentAlert();
  if (idx === -1) return;
}

// 处理更新本脚本的逻辑
if (idx == 0) {
  console.log('检查更新');
  checkUpdate = true;
  await update();
  return;
}

// 处理文件选择和内容获取
if (idx == 1) {
  let url, name;

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
    
    let downloadIdx = await alert.presentAlert();
    if (downloadIdx === -1) return;

    url = alert.textFieldValue(0);
    name = alert.textFieldValue(1);

    if (!url) {
      console.log('链接为空，退出操作');
      return;
    }

    if (!name) {
      const plainUrl = url.split('?')[0];
      const fullname = plainUrl.substring(plainUrl.lastIndexOf('/') + 1);
      name = fullname ? fullname.replace(/\.sgmodule$/, '') : `untitled-${new Date().toLocaleString()}`;
    }

    name = convertToValidFileName(name);

    folderPath = await selectFolder();
    if (!folderPath) return;

    const req = new Request(url);
    req.timeoutInterval = 30;

    try {
      const fileContent = await req.loadString();
      if (!fileContent) {
        console.log('下载内容为空，退出操作');
        return;
      }

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

// 处理文件和更新
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
      let content, filePath;
      if (contents.length > 0) {
        content = contents[index];
      } else {
        filePath = `${folderPath}/${file}`;
        content = fm.readString(filePath);
      }

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

      const alert = new Alert();
      alert.title = '选择新的分类';
      alert.message = `当前分类: ${originalCategory}`;
      alert.addAction('📕去广告模块');
      alert.addAction('📘功能模块');
      alert.addAction('📗面板模块');
      alert.addAction('📚默认不变');
      const categoryIdx = await alert.presentAlert();

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
      await delay(1000); // 使用优化后的延时函数

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

// 输出处理结果
if (!checkUpdate && !fromUrlScheme) {
  const resultIdx = await showResultAlert(report, categoryReplaceSuccess, categoryKeepDefaultCount, categoryReplaceFail);

  // 处理用户选择的操作
  if (resultIdx === 0) {
    // 重载 Surge
    console.log('用户选择了重载 Surge');
    // 你可以在这里添加重载 Surge 的逻辑
  } else if (resultIdx === 1) {
    // 打开 Surge
    console.log('用户选择了打开 Surge');
    // 你可以在这里添加打开 Surge 的逻辑
  } else if (resultIdx === -1) {
    console.log('用户选择了关闭');
    // 你可以在这里添加关闭的逻辑
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


