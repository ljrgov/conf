// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: green; icon-glyph: cloud-download-alt;

// prettier-ignore
let ToolVersion = "2.4";

async function delay(milliseconds) {
  var before = Date.now();
  while (Date.now() < before + milliseconds) {}
  return true;
}

function convertToValidFileName(str) {
  // 替换非法字符为下划线
  const invalidCharsRegex = /[\/:*?"<>|]/g;
  const validFileName = str.replace(invalidCharsRegex, '_');

  // 删除多余的点号
  const multipleDotsRegex = /\.{2,}/g;
  const fileNameWithoutMultipleDots = validFileName.replace(multipleDotsRegex, '.');

  // 删除文件名开头和结尾的点号和空格
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

  if (idx === -1) return;
}

let folderPath;
let files = [];
let contents = [];
const fm = FileManager.iCloud();

if (idx == 1) { // “从链接创建” 选项
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
  }

  if (!name) {
    const plainUrl = url.split('?')[0];
    const fullname = plainUrl.substring(plainUrl.lastIndexOf('/') + 1);
    name = fullname ? fullname.replace(/\.sgmodule$/, '') : `untitled-${new Date().toLocaleString()}`;
  }

  name = convertToValidFileName(name);
  files = [`${name}.sgmodule`];
  contents = [`#SUBSCRIBED ${url}`];

  // 弹出文件夹选择器
  folderPath = await DocumentPicker.openFolder();
  if (!folderPath) return;
  
} else if (idx == 2) {
  const filePath = await DocumentPicker.openFile();
  folderPath = filePath.substring(0, filePath.lastIndexOf('/'));
  files = [filePath.substring(filePath.lastIndexOf('/') + 1)];
} else if (idx == 3) {
  folderPath = await DocumentPicker.openFolder();
  files = fm.listContents(folderPath);
} else if (idx == 0) {
  console.log('检查更新');
  checkUpdate = true;
  await update();
}

// 定义报告数据
let report = {
  success: 0,
  fail: [],
  noUrl: 0,
};

let categoryReplaceSuccess = 0;  // 用于记录选择“替换成功”的次数
let categoryKeepDefaultCount = 0; // 用于记录选择“默认不变”的次数
let categoryReplaceFail = 0;  // 用于记录选择“替换失败”的次数

for await (const [index, file] of files.entries()) {
  if (file && !/\.(conf|txt|js|list)$/i.test(file)) {
    let originalName, originalDesc, originalCategory, noUrl;

    try {
      let content, filePath;
      if (contents.length > 0) {
        content = contents[index];
      } else {
        filePath = `${folderPath}/${file}`;
        content = fm.readString(filePath);
      }

      // 处理模块元数据
      const originalNameMatched = content.match(/^#!name\s*?=\s*(.*?)\s*(\n|$)/im);
      if (originalNameMatched) originalName = originalNameMatched[1];

      const originalDescMatched = content.match(/^#!desc\s*?=\s*(.*?)\s*(\n|$)/im);
      if (originalDescMatched) originalDesc = originalDescMatched[1].replace(/^🔗.*?]\s*/i, '');

      let originalCategoryMatched = content.match(/^#!category\s*?=\s*(.*?)\s*(\n|$)/im);
      let originalCategory = originalCategoryMatched ? originalCategoryMatched[1] : null;

     // 如果没有分类，默认添加
if (!originalCategory) {
  const lines = content.split('\n');
  if (lines.length >= 2) {
    lines.splice(2, 0, '#!category=📚未分类');
    content = lines.join('\n');
    originalCategory = '📚未分类'; // 设置默认值
  } else {
    content = `#!category=📚未分类\n${content}`;
    originalCategory = '📚未分类';
  }
}

// 弹出对话框让用户选择新的分类
const alert = new Alert();
alert.title = '选择新的分类';
alert.message = `当前分类: ${originalCategory}`;
alert.addAction('📕去广告模块');
alert.addAction('📘功能模块');
alert.addAction('📗面板模块');
alert.addAction('📚默认不变');
const categoryIdx = await alert.presentAlert();

// 默认保持原始分类
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
    categoryKeepDefaultCount += 1; // 选择默认不变，计数增加
    break;
  default:
    category = originalCategory; // 保持原始分类
    break;
}

// 替换分类字段
if (category !== originalCategory) {
  if (content.match(/^#!category\s*?=.*(\n|$)/im)) {
    // 正确替换 category 字段
    content = content.replace(/^#!category\s*?=.*(\n|$)/im, `#!category=${category}\n`);
    categoryReplaceSuccess += 1; // 替换成功计数
  } else {
    // 如果没有正确匹配，记录为替换失败
    categoryReplaceFail += 1;
  }
} else if (categoryIdx !== 3) {
  // 如果没有选择默认不变且没有进行替换，记录为替换失败
  categoryReplaceFail += 1;
}


      // 查找链接
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

      // 下载模块内容
      const req = new Request(url);
      req.timeoutInterval = 10;
      req.method = 'GET';
      let res = await req.loadString();
      if (!res) throw new Error('未获取到模块内容');

      const statusCode = req.response.statusCode;
      if (statusCode < 200 || statusCode >= 400) throw new Error(`状态码错误: ${statusCode}`);

      // 检查合法性
      const nameMatched = res.match(/^#!name\s*?=\s*?\s*(.*?)\s*(\n|$)/im);
      if (!nameMatched) throw new Error('不是合法的模块内容');

      const name = nameMatched[1];
      if (!name) throw new Error('模块无名称字段');

      const descMatched = res.match(/^#!desc\s*?=\s*(.*?)\s*(\n|$)/im);
      let desc = descMatched ? descMatched[1] : '';
      if (!desc) res = `#!desc=\n${res}`;

      // 更新描述和链接信息
      res = res.replace(/^(#SUBSCRIBED|# 🔗 模块链接)(.*?)(\n|$)/gim, '');
      res = addLineAfterLastOccurrence(res, `\n\n# 🔗 模块链接\n${subscribed.replace(/\n/g, '')}\n`);
      content = res.replace(/^#!desc\s*?=\s*/im, `#!desc=🔗 [${new Date().toLocaleString()}] `);

      // 保存文件
      if (filePath) {
        fm.writeString(filePath, content);
      } else {
        await DocumentPicker.exportString(content, file);
      }

      report.success += 1; // 记录更新成功
    } catch (error) {
      console.log(`处理模块 ${file} 时出错: ${error.message}`);
      if (noUrl) {
        report.noUrl += 1;
      } else {
        report.fail.push(`${file}: ${error.message}`); // 将失败原因加入报告
      }
    }
  }
}

// 输出更新结果
if (!checkUpdate && !fromUrlScheme) {
  const alert = new Alert();
  
  // 检查报告中的失败和无链接模块
  const upErrk = report.fail.length > 0 ? `❌ 模块更新失败: ${report.fail.length}` : '';
  const noUrlErrk = report.noUrl > 0 ? `⚠️ 无链接: ${report.noUrl}` : '';
  const categoryReplaceInfo = categoryReplaceSuccess > 0 ? `📚 类别替换成功: ${categoryReplaceSuccess}` : '';
  const categoryKeepDefaultInfo = categoryKeepDefaultCount > 0 ? `🗂️ 类别保持默认: ${categoryKeepDefaultCount}` : '';
  const categoryReplaceFailInfo = categoryReplaceFail > 0 ? `❗ 类别替换失败: ${categoryReplaceFail}` : '';

  // 组织结果信息，确保布局美观，无过多间距
  const resultMessage = [
    noUrlErrk,
    `✅ 模块更新成功: ${report.success}`,
    upErrk + (report.fail.length > 0 ? `\n失败的模块: ${report.fail.join(', ')}` : ''),
    categoryReplaceInfo,
    categoryKeepDefaultInfo,
    categoryReplaceFailInfo
  ].filter(Boolean).join('\n');

  // 设置弹窗标题和信息
  alert.title = `📦 处理模块总数: ${report.success + report.fail.length + report.noUrl}`;
  alert.message = resultMessage;

  // 添加按钮操作
  alert.addAction('打开 Surge');  // 将打开 Surge 放在首位
  alert.addDestructiveAction('重载 Surge');  // 将重载 Surge 放在次要位置
  alert.addCancelAction('关闭');

  // 显示弹窗并根据用户选择执行相应操作
  const idx = await alert.presentAlert();

  if (idx == 1) {  // 选择了 "重载 Surge"
    const req = new Request('http://script.hub/reload');
    req.timeoutInterval = 10;
    req.method = 'GET';
    await req.loadString();
  } else if (idx == 0) {  // 选择了 "打开 Surge"
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


