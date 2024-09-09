// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: green; icon-glyph: cloud-download-alt;

// prettier-ignore
let ToolVersion = "2.8";

async function delay(milliseconds) {
  const start = Date.now();
  while (Date.now() - start < milliseconds) {
    await new Promise(resolve => setTimeout(resolve, 10)); // 允许事件循环运行，减少 CPU 占用
  }
  return true;
}

function convertToValidFileName(str) {
  // 替换非法字符为下划线
  const invalidCharsRegex = /[\/:*?"<>|]/g;
  let validFileName = str.replace(invalidCharsRegex, '_');

  // 删除多余的点号
  validFileName = validFileName.replace(/\.{2,}/g, '.');

  // 删除文件名开头和结尾的点号和空格
  validFileName = validFileName.trim().replace(/^[.]+|[.]+$/g, '');

  return validFileName;
}

function addLineAfterLastOccurrence(text, addition) {
  const regex = /^#!.+?$/gm;
  const matchArray = text.match(regex);

  if (matchArray && matchArray.length > 0) {
    const lastMatch = matchArray[matchArray.length - 1];
    const insertIndex = text.lastIndexOf(lastMatch) + lastMatch.length;
    return text.slice(0, insertIndex) + addition + text.slice(insertIndex);
  }

  return text + addition;  // 如果没有找到任何匹配项，直接在文本末尾添加
}

// 主代码逻辑
let idx;
let fromUrlScheme = false;  // 初始化为 false
let checkUpdate = false;    // 初始化为 false
let folderPath;  // 定义文件夹路径
let files = [];
let contents = [];
const fm = FileManager.iCloud();

// 检查是否从 URL scheme 启动
if (args.queryParameters.url) {
  fromUrlScheme = true;
}

if (fromUrlScheme) {
  idx = 1;  // 直接进入“从链接创建”流程
} else {
  let alert = new Alert();
  alert.title = 'Surge 模块工具';
  alert.addDestructiveAction('更新本脚本');  // idx = 0
  alert.addAction('从链接创建');            // idx = 1
  alert.addAction('更新单个模块');          // idx = 2
  alert.addAction('更新全部模块');          // idx = 3
  alert.addCancelAction('取消');
  
  idx = await alert.presentAlert();
  if (idx === -1) return;  // 用户取消操作，直接退出
}

// 如果选择了“更新本脚本”，直接退出
if (idx == 0) {
  console.log('检查更新');
  checkUpdate = true;
  await update();  // 确保 update() 已定义
  return;  // 直接退出，不打开文件管理器
}

// 弹出文件夹选择器（仅在 idx 为 1、2、3 时需要）
if (!folderPath && idx != 0) {
  folderPath = await DocumentPicker.openFolder();
  if (!folderPath) return;  // 用户未选择文件夹，退出
}

if (idx == 1) {  // "从链接创建"
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
    if (downloadIdx === -1) return;  // 用户取消操作，退出

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

    name = convertToValidFileName(name);  // 确保名称合法
    files = [`${name}.sgmodule`];
    contents = [`#SUBSCRIBED ${url}`];

    // 弹出文件夹选择器
    folderPath = await DocumentPicker.openFolder();
    if (!folderPath) return;  // 用户未选择文件夹，退出
  } else {
    // 从链接下载文件
    if (!url) {
      console.log('URL 未定义，退出操作');
      return;
    }

    const req = new Request(url);
    req.timeoutInterval = 30;

    try {
      const fileContent = await req.loadString();
      if (!fileContent) {
        console.log('下载内容为空，退出操作');
        return;
      }

      // 创建文件路径
      const filePath = `${folderPath}/${name}.sgmodule`;
      fm.writeString(filePath, fileContent);
      files = [`${name}.sgmodule`];
      contents = [fileContent];
    } catch (err) {
      console.log(`下载失败: ${err.message}`);
      return;
    }
  }

} else if (idx == 2) {  // "更新单个模块"
  const filePath = await DocumentPicker.openFile();  // 先选择文件
  if (!filePath) return;  // 用户取消选择，退出
  
  folderPath = filePath.substring(0, filePath.lastIndexOf('/'));  // 提取文件夹路径
  files = [filePath.substring(filePath.lastIndexOf('/') + 1)];  // 获取文件名

} else if (idx == 3) {  // "更新全部模块"
  folderPath = await DocumentPicker.openFolder();  // 直接选择文件夹
  if (!folderPath) return;  // 用户取消选择，退出

  files = fm.listContents(folderPath);  // 列出文件夹中的所有文件
}

// 开始处理文件并进行分类选择
let report = {
  success: 0,
  fail: [],
  noUrl: 0,
};
let categoryReplaceSuccess = 0;
let categoryKeepDefaultCount = 0;
let categoryReplaceFail = 0;

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
          originalCategory = '📚未分类';
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
          content = content.replace(/^#!category\s*?=.*(\n|$)/im, `#!category=${category}\n`);
          categoryReplaceSuccess += 1; // 替换成功计数
        } else {
          content = addLineAfterLastOccurrence(content, `#!category=${category}\n`);
          categoryReplaceFail += 1; // 替换失败计数
        }
      }

      // 保存文件
      if (filePath) {
        fm.writeString(filePath, content);
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

// 输出处理结果
if (!checkUpdate && !fromUrlScheme) {
  const alert = new Alert();
  const upErrk = report.fail.length > 0 ? `❌ 模块更新失败: ${report.fail.length}` : '';
  const noUrlErrk = report.noUrl > 0 ? `⚠️ 无链接: ${report.noUrl}` : '';
  const categoryReplaceInfo = categoryReplaceSuccess > 0 ? `📚 类别替换成功: ${categoryReplaceSuccess}` : '';
  const categoryKeepDefaultInfo = categoryKeepDefaultCount > 0 ? `🗂️ 类别保持默认: ${categoryKeepDefaultCount}` : '';
  const categoryReplaceFailInfo = categoryReplaceFail > 0 ? `❗ 类别替换失败: ${categoryReplaceFail}` : '';

  const resultMessage = [
    noUrlErrk,
    `✅ 模块更新成功: ${report.success}`,
    upErrk,
    categoryReplaceInfo,
    categoryKeepDefaultInfo,
    categoryReplaceFailInfo
  ].filter(Boolean).join('\n');

  alert.title = `📦 处理模块总数: ${report.success + report.fail.length + report.noUrl}`;
  alert.message = resultMessage;
  alert.addDestructiveAction('重载 Surge');
  alert.addAction('打开 Surge');
  alert.addCancelAction('关闭');
  
  const idx = await alert.presentAlert();
  if (idx == 1) {
    const req = new Request('http://script.hub/reload');
    req.timeoutInterval = 10;
    req.method = 'GET';
    await req.loadString();
  } else if (idx == 0) {
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


