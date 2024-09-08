// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: cloud-download-alt;

// prettier-ignore
let ToolVersion = "3.0.3";

async function delay(milliseconds) {
  var before = Date.now()
  while (Date.now() < before + milliseconds) {}
  return true
}
function convertToValidFileName(str) {
  // 替换非法字符为下划线
  const invalidCharsRegex = /[\/:*?"<>|]/g
  const validFileName = str.replace(invalidCharsRegex, '_')

  // 删除多余的点号
  const multipleDotsRegex = /\.{2,}/g
  const fileNameWithoutMultipleDots = validFileName.replace(multipleDotsRegex, '.')

  // 删除文件名开头和结尾的点号和空格
  const leadingTrailingDotsSpacesRegex = /^[\s.]+|[\s.]+$/g
  const finalFileName = fileNameWithoutMultipleDots.replace(leadingTrailingDotsSpacesRegex, '')

  return finalFileName
}

function addLineAfterLastOccurrence(text, addition) {
  const regex = /^#!.+?$/gm
  const matchArray = text.match(regex)
  const lastIndex = matchArray ? matchArray.length - 1 : -1

  if (lastIndex >= 0) {
    const lastMatch = matchArray[lastIndex]
    const insertIndex = text.indexOf(lastMatch) + lastMatch.length
    const newText = text.slice(0, insertIndex) + addition + text.slice(insertIndex)
    return newText
  }

  return text
}

let idx
let fromUrlScheme
let checkUpdate
// if (args.queryParameters.url && args.queryParameters.name) {
if (args.queryParameters.url) {
  fromUrlScheme = true
}
if (fromUrlScheme) {
  idx = 1
} else {
  let alert = new Alert()
  alert.title = 'Surge 模块工具'
  //alert.addDestructiveAction("更新文件夹内全部文件")
  alert.addDestructiveAction('更新本脚本')
  alert.addAction('从链接创建')
  alert.addAction('更新单个模块')
  alert.addAction('更新全部模块')
  alert.addCancelAction('取消')
  idx = await alert.presentAlert()
}

let folderPath
let files = []
let contents = []
const fm = FileManager.iCloud()
if (idx == 3) {
  folderPath = await DocumentPicker.openFolder()
  files = fm.listContents(folderPath)
} else if (idx == 2) {
  const filePath = await DocumentPicker.openFile()
  folderPath = filePath.substring(0, filePath.lastIndexOf('/'))
  files = [filePath.substring(filePath.lastIndexOf('/') + 1)]
} else if (idx == 1) {
  let url
  let name
  if (fromUrlScheme) {
    url = args.queryParameters.url
    name = args.queryParameters.name
  } else {
    alert = new Alert()
    alert.title = '将自动添加后缀 .sgmodule'
    alert.addTextField('链接(必填)', '')
    alert.addTextField('名称(选填)', '')
    alert.addAction('下载')
    alert.addCancelAction('取消')
    await alert.presentAlert()
    url = alert.textFieldValue(0)
    name = alert.textFieldValue(1)
  }
  if (url) {
    if (!name) {
      const plainUrl = url.split('?')[0]
      const fullname = plainUrl.substring(plainUrl.lastIndexOf('/') + 1)
      if (fullname) {
        name = fullname.replace(/\.sgmodule$/, '')
      }
      if (!name) {
        name = `untitled-${new Date().toLocaleString()}`
      }
    }
    name = convertToValidFileName(name)
    files = [`${name}.sgmodule`]
    contents = [`#SUBSCRIBED ${url}`]
  }
} else if (idx == 0) {
  console.log('检查更新')
  checkUpdate = true
  await update()
}

let report = {
  success: 0,
  fail: [],
  noUrl: 0,
}

// 初始化分类变更信息和计数
let categoryChangeInfo = ''; // 用于跟踪分类变更信息
let categoryChangedCount = 0; // 记录分类变更的次数

// 提示用户选择分类
let categoryAlert = new Alert();
categoryAlert.title = '选择模块分类';
categoryAlert.addAction('去广告');
categoryAlert.addAction('功能模块');
categoryAlert.addAction('面板模块');
categoryAlert.addCancelAction('取消');
let categoryIdx = await categoryAlert.presentAlert();

// 根据选择更新分类
let selectedCategory;
switch (categoryIdx) {
  case 0:
    selectedCategory = '去广告';
    break;
  case 1:
    selectedCategory = '功能模块';
    break;
  case 2:
    selectedCategory = '面板模块';
    break;
  default:
    selectedCategory = '未分类'; // 如果用户取消，设置默认分类
}

// 显示初始对话框
let initialAlert = new Alert();
initialAlert.title = '处理中...';
initialAlert.message = '请稍等，正在处理文件。';
initialAlert.addCancelAction('取消');

// 用于标记用户是否取消了操作
let isCancelled = false;

// 显示初始对话框并启动文件处理
let initialAlertPromise = initialAlert.presentAlert();
let processingPromise = new Promise(async (resolve) => {
  // 处理文件的异步函数
  async function processFiles() {
    for await (const [index, file] of files.entries()) {
      if (isCancelled) {
        console.log('操作已取消');
        break;
      }

      if (file && !/\.(conf|txt|js|list)$/i.test(file)) {
        let originalCategory;
        let noUrl; // 记录没有链接的文件
        let originalName, originalDesc; // 记录原始信息
        try {
          let content;
          let filePath;

          // 检查是否从 `contents` 读取内容
          if (contents.length > 0) {
            content = contents[index];
          } else {
            filePath = `${folderPath}/${file}`;
            content = fm.readString(filePath);
          }

          // 处理 #!name 和 #!desc
          const originalNameMatched = `${content}`.match(/^#\!name\s*?=\s*(.*?)\s*(\n|$)/im);
          if (originalNameMatched) originalName = originalNameMatched[1];

          const originalDescMatched = `${content}`.match(/^#\!desc\s*?=\s*(.*?)\s*(\n|$)/im);
          if (originalDescMatched) {
            originalDesc = originalDescMatched[1];
            if (originalDesc) originalDesc = originalDesc.replace(/^🔗.*?]\s*/i, ''); // 去掉旧的链接
          }

          // 处理订阅链接
          const matched = `${content}`.match(/^#SUBSCRIBED\s+(.*?)\s*(\n|$)/im);
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

          // 获取新的模块内容
          const req = new Request(url);
          req.timeoutInterval = 10;
          req.method = 'GET';
          let res = await req.loadString();
          const statusCode = req.response.statusCode;
          if (statusCode < 200 || statusCode >= 400) {
            throw new Error(`statusCode: ${statusCode}`);
          }

          // 验证模块内容是否合法
          const nameMatched = `${res}`.match(/^#\!name\s*?=\s*?\s*(.*?)\s*(\n|$)/im);
          if (!nameMatched) throw new Error(`不是合法的模块内容`);
          const name = nameMatched[1];
          if (!name) throw new Error('模块无名称字段');

          // 处理 #!desc
          const descMatched = `${res}`.match(/^#\!desc\s*?=\s*?\s*(.*?)\s*(\n|$)/im);
          let desc;
          if (descMatched) desc = descMatched[1];
          if (!desc) res = `#!desc=\n${res}`;

          // 处理分类
          let categoryMatched = content.match(/^#\!category\s*?=\s*(.*?)\s*(\n|$)/im);
          originalCategory = categoryMatched ? categoryMatched[1] : '未分类'; // 记录原分类

          // 如果没有 #!category 字段，添加新分类；如果有则替换
          if (!categoryMatched) {
            content = `#!category=${selectedCategory}\n${content}`;
          } else if (selectedCategory !== originalCategory) {
            content = content.replace(/^#\!category\s*?=\s*(.*?)\s*(\n|$)/im, `#!category=${selectedCategory}\n`);
            categoryChangedCount++; // 记录分类变更次数
          }

          // 保存文件内容
          if (filePath) {
            fm.writeString(filePath, content);
          } else {
            await DocumentPicker.exportString(content, file);
          }

          // 输出更新结果
          let nameInfo = `${name}`;
          let descInfo = `${desc}`;
          if (originalName && name !== originalName) {
            nameInfo = `${originalName} -> ${name}`;
          }
          if (originalDesc && desc !== originalDesc) {
            descInfo = `${originalDesc} -> ${desc}`;
          }
          console.log(`\n✅ ${nameInfo}\n${descInfo}\n${file}`);
          report.success += 1;
          await delay(1 * 1000);

        } catch (e) {
          if (noUrl) {
            report.noUrl += 1;
          } else {
            report.fail.push(originalName || file);
          }
          console.error(`❌ ${originalName || file}: ${e}`);
        }
      }
    }
    resolve(); // 文件处理完成
  }

  processFiles(); // 启动文件处理
});

// 等待用户操作和文件处理完成
await Promise.race([initialAlertPromise, processingPromise]);

// 文件处理完成后关闭初始对话框并显示结果对话框
if (!isCancelled) {
  // Close initial alert (assuming there's a method or action to close it, replace with the actual method if available)
  initialAlert.dismiss(); // Close initial alert if it was shown

  // 显示结果对话框
  let resultAlert = new Alert();
  let upErrk = report.fail.length > 0 ? `❌ 更新失败: ${report.fail.length}` : '';
  let noUrlErrk = report.noUrl > 0 ? `🈚️ 无链接: ${report.noUrl}` : '';
  resultAlert.title = `📦 模块总数: ${report.success + report.fail.length + report.noUrl}`;
  resultAlert.message = `${noUrlErrk}\n✅ 更新成功: ${report.success}\n${categoryChangeInfo}\n${upErrk}${report.fail.length > 0 ? `\n${report.fail.join(', ')}` : ''}`;
  resultAlert.addDestructiveAction('重载 Surge');
  resultAlert.addAction('打开 Surge');
  resultAlert.addCancelAction('关闭');

  let idx = await resultAlert.presentAlert();
  if (idx == 0) {
    const req = new Request('http://script.hub/reload');
    req.timeoutInterval = 10;
    req.method = 'GET';
    await req.loadString();
  } else if (idx == 1) {
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


