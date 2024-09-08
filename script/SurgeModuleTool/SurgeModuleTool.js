// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: green; icon-glyph: cloud-download-alt;

// prettier-ignore
let ToolVersion = "1.4";

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

console.log(`✅ ${nameInfo}\n${descInfo}\n类别: ${categoryInfo}\n${file}`);
report.success += 1;
await delay(1 * 1000);

if (fromUrlScheme) {
  alert = new Alert();
  alert.title = `✅ ${nameInfo}`;
  alert.message = `${descInfo}\n类别: ${categoryInfo}\n${file}`;
  alert.addDestructiveAction('重载 Surge');
  alert.addAction('打开 Surge');
  alert.addCancelAction('关闭');
  idx = await alert.presentAlert();
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
  if (noUrl) {
    report.noUrl += 1;
  } else {
    report.fail.push(originalName || file);
  }

  if (noUrl) {
    console.log(`⚠️ ${originalName || ''}\n${file}`);
    console.log(e);
  } else {
    console.log(`\n❌ ${originalName || ''}\n${file}`);
    console.error(`${originalName || file}: ${e}`);
  }

  if (fromUrlScheme) {
    alert = new Alert();
    alert.title = `❌ ${originalName || ''}\n${file}`;
    alert.message = `${e.message || e}`;
    alert.addCancelAction('关闭');
    await alert.presentAlert();
  }
}
}

if (!checkUpdate && !fromUrlScheme) {
  alert = new Alert();
  let upErrk = report.fail.length > 0 ? `❌ 模块更新失败: ${report.fail.length}` : '';
  let noUrlErrk = report.noUrl > 0 ? `⚠️ 无链接: ${report.noUrl}` : '';
  let categoryReplaceInfo = categoryReplaceSuccess > 0 ? `📁 类别替换成功: ${categoryReplaceSuccess}` : '';
  alert.title = `📦 模块总数: ${report.success + report.fail.length + report.noUrl}`;
  alert.message = `${noUrlErrk}\n✅ 模块更新成功: ${report.success}\n${upErrk}${report.fail.length > 0 ? `\n${report.fail.join(', ')}` : ''}\n${categoryReplaceInfo}`;
  alert.addDestructiveAction('重载 Surge');
  alert.addAction('打开 Surge');
  alert.addCancelAction('关闭');
  idx = await alert.presentAlert();
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


