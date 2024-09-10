// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: cloud-download-alt;

// prettier-ignore
let ToolVersion = "1.2";

// 全局变量来标记是否取消操作
let isCancelled = false;

// 优化的delay函数
async function delay(milliseconds) {
  return new Promise(resolve => Timer.schedule(milliseconds / 1000, false, () => resolve()));
}

function convertToValidFileName(str) {
  const invalidCharsRegex = /[\/:*?"<>|]/g
  const validFileName = str.replace(invalidCharsRegex, '_')
  const multipleDotsRegex = /\.{2,}/g
  const fileNameWithoutMultipleDots = validFileName.replace(multipleDotsRegex, '.')
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
if (args.queryParameters.url) {
  fromUrlScheme = true
}

if (fromUrlScheme) {
  idx = 1
} else {
  let alert = new Alert()
  alert.title = 'Surge 模块工具'
  alert.addDestructiveAction('更新本脚本')
  alert.addAction('从链接创建')
  alert.addAction('更新单个模块')
  alert.addAction('更新全部模块')
  alert.addCancelAction('取消')
  idx = await alert.presentAlert()
  if (idx === -1) {  // 用户点击了取消
    isCancelled = true;
  }
}

if (isCancelled) {
  console.log("操作已取消");
  Script.complete();
  return;
}

let folderPath
let files = []
let contents = []
const fm = FileManager.iCloud()

// 更新主菜单逻辑
if (idx == 3) {  // 更新全部模块
  folderPath = await DocumentPicker.openFolder()
  if (!folderPath) {
    isCancelled = true;
  } else {
    files = fm.listContents(folderPath)
  }
} else if (idx == 2) {  // 更新单个模块
  const filePath = await DocumentPicker.openFile()
  if (!filePath) {
    isCancelled = true;
  } else {
    folderPath = filePath.substring(0, filePath.lastIndexOf('/'))
    files = [filePath.substring(filePath.lastIndexOf('/') + 1)]
  }
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
    let result = await alert.presentAlert()
    if (result === -1) {  // 用户点击了取消
      isCancelled = true;
    } else {
      url = alert.textFieldValue(0)
      name = alert.textFieldValue(1)
    }
  }
  if (!isCancelled && url) {
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

if (isCancelled) {
  console.log("操作已取消");
  Script.complete();
  return;
}

let report = {
  success: 0,
  fail: [],
  noUrl: 0,
}

// 全局变量来存储最后处理的模块信息和类别选择结果
let lastProcessedModuleName = "";
let lastProcessedModuleCategory = "";
let categoryUpdateResult = "";

// 主要的模块处理函数
async function processModule(folderPath, file) {
  if (isCancelled) return;  // 检查是否取消
  if (file && !/\.(conf|txt|js|list)$/i.test(file)) {
    let originalName
    let originalDesc
    let noUrl
    try {
      let content
      let filePath
      if (contents.length > 0) {
        content = contents[files.indexOf(file)]
      } else {
        filePath = `${folderPath}/${file}`
        content = fm.readString(filePath)
      }
      const originalNameMatched = `${content}`.match(/^#\!name\s*?=\s*(.*?)\s*(\n|$)/im)
      if (originalNameMatched) {
        originalName = originalNameMatched[1]
      }
      const originalDescMatched = `${content}`.match(/^#\!desc\s*?=\s*(.*?)\s*(\n|$)/im)
      if (originalDescMatched) {
        originalDesc = originalDescMatched[1]
        if (originalDesc) {
          originalDesc = originalDesc.replace(/^🔗.*?]\s*/i, '')
        }
      }
      const matched = `${content}`.match(/^#SUBSCRIBED\s+(.*?)\s*(\n|$)/im)
      if (!matched) {
        noUrl = true
        throw new Error('无订阅链接')
      }
      const subscribed = matched[0]
      const url = matched[1]
      if (!url) {
        noUrl = true
        throw new Error('无订阅链接')
      }

      const req = new Request(url)
      req.timeoutInterval = 10
      req.method = 'GET'
      let res = await req.loadString()
      const statusCode = req.response.statusCode
      if (statusCode < 200 || statusCode >= 400) {
        throw new Error(`statusCode: ${statusCode}`)
      }
      if (!res) {
        throw new Error(`未获取到模块内容`)
      }

      const nameMatched = `${res}`.match(/^#\!name\s*?=\s*?\s*(.*?)\s*(\n|$)/im)
      if (!nameMatched) {
        throw new Error(`不是合法的模块内容`)
      }
      const name = nameMatched[1]
      if (!name) {
        throw new Error('模块无名称字段')
      }

      // 处理 category
      let category = "📚未分类";
      const categoryRegex = /^#!category\s*?=\s*(.*?)\s*$/im;
      const categoryMatch = res.match(categoryRegex);
      if (categoryMatch) {
        category = categoryMatch[1];
      }

      // 更新最后处理的模块信息
      lastProcessedModuleName = name;
      lastProcessedModuleCategory = category;

      if (!categoryRegex.test(res)) {
        // 如果不存在 category，在 name 之后添加新的 category 行
        res = res.replace(/^(#!name.*?)$/im, `$1\n#!category=${category}`)
      }

      const descMatched = `${res}`.match(/^#\!desc\s*?=\s*?\s*(.*?)\s*(\n|$)/im)
      let desc
      if (descMatched) {
        desc = descMatched[1]
      }
      if (!desc) {
        res = `#!desc=\n${res}`
      }
      res = res.replace(/^(#SUBSCRIBED|# 🔗 模块链接)(.*?)(\n|$)/gim, '')
      res = addLineAfterLastOccurrence(res, `\n\n# 🔗 模块链接\n${subscribed.replace(/\n/g, '')}\n`)
      content = `${res}`.replace(/^#\!desc\s*?=\s*/im, `#!desc=🔗 [${new Date().toLocaleString()}] `)
      if (filePath) {
        fm.writeString(filePath, content)
      } else {
        contents[files.indexOf(file)] = content
      }

      let nameInfo = `${name}`
      let descInfo = `${desc}`
      if (originalName && name !== originalName) {
        nameInfo = `${originalName} -> ${name}`
      }
      if (originalDesc && desc !== originalDesc) {
        descInfo = `${originalDesc} -> ${desc}`
      }
      console.log(`\n✅ ${nameInfo}\n${descInfo}\n${file}`)
      report.success += 1
      await delay(1 * 1000)
      if (fromUrlScheme) {
        alert = new Alert()
        alert.title = `✅ ${nameInfo}`
        alert.message = `${descInfo}\n${file}`
        alert.addDestructiveAction('重载 Surge')
        alert.addAction('打开 Surge')
        alert.addCancelAction('关闭')
        idx = await alert.presentAlert()
        if (idx == 0) {
          const req = new Request('http://script.hub/reload')
          req.timeoutInterval = 10
          req.method = 'GET'
          let res = await req.loadString()
        } else if (idx == 1) {
          Safari.open('surge://')
        }
      }
    } catch (e) {
      if (noUrl) {
        report.noUrl += 1
      } else {
        report.fail.push(originalName || file)
      }

      if (noUrl) {
        console.log(`\n🈚️ ${originalName || ''}\n${file}`)
        console.log(e)
      } else {
        console.log(`\n❌ ${originalName || ''}\n${file}`)
        console.error(`${originalName || file}: ${e}`)
      }
      if (fromUrlScheme) {
        alert = new Alert()
        alert.title = `❌ ${originalName || ''}\n${file}`
        alert.message = `${e.message || e}`
        alert.addCancelAction('关闭')
        await alert.presentAlert()
      }
    }
  }
}

// 更新 category 的函数
async function updateCategory(folderPath, file, newCategory) {
  if (isCancelled) return;  // 检查是否取消
  let content;
  if (contents.length > 0) {
    content = contents[files.indexOf(file)];
  } else {
    const filePath = `${folderPath}/${file}`;
    content = fm.readString(filePath);
  }
  
  if (content) {
    const categoryRegex = /^#!category\s*?=.*?$/im;
    if (categoryRegex.test(content)) {
      content = content.replace(categoryRegex, `#!category=${newCategory}`);
    } else {
      content = content.replace(/^(#!name.*?)$/im, `$1\n#!category=${newCategory}`);
    }
    
    if (contents.length > 0) {
      contents[files.indexOf(file)] = content;
    } else {
      fm.writeString(`${folderPath}/${file}`, content);
    }
  }
}

// 简化的主处理逻辑
async function processFiles() {
  for (const file of files) {
    if (isCancelled) break;  // 检查是否取消
    await processModule(folderPath, file);
  }
}

// 执行主处理逻辑
if (idx >= 1 && idx <= 3 && !isCancelled) {
  await processFiles();

  if (!isCancelled && lastProcessedModuleName) {
    // 添加类别选择对话框
    let categoryAlert = new Alert()
    categoryAlert.title = "选择模块类别"
    categoryAlert.message = `当前模块：${lastProcessedModuleName}\n当前类别：${lastProcessedModuleCategory}`
    categoryAlert.addAction("📙广告模块")
    categoryAlert.addAction("📗功能模块")
    categoryAlert.addAction("📘面板模块")
    categoryAlert.addAction("📚默认不变")
    categoryAlert.addCancelAction("取消")
    let categoryChoice = await categoryAlert.presentAlert()
    
    if (categoryChoice === -1) {  // 用户点击了取消
      isCancelled = true;
    } else if (categoryChoice !== 3) { // 如果不是"默认不变"
      let newCategory;
      switch(categoryChoice) {
case 0:
          newCategory = "📙广告模块"
          break
        case 1:
          newCategory = "📗功能模块"
          break
        case 2:
          newCategory = "📘面板模块"
          break
      }
      for (const file of files) {
        if (isCancelled) break;  // 检查是否取消
        await updateCategory(folderPath, file, newCategory)
      }
      categoryUpdateResult = `Category 更新成功：${newCategory}`
    } else {
      categoryUpdateResult = `Category 保持不变：${lastProcessedModuleCategory}`
    }
  } else {
    categoryUpdateResult = "无法更新 Category：未处理任何模块"
  }
}

// 结果报告逻辑
if (!checkUpdate && !fromUrlScheme && !isCancelled) {
  let alert = new Alert()
  let upErrk = report.fail.length > 0 ? `❌ 更新失败: ${report.fail.length}` : '',
    noUrlErrk = report.noUrl > 0 ? `🈚️ 无链接: ${report.noUrl}` : ''
  alert.title = `📦 模块总数: ${report.success + report.fail.length + report.noUrl}`
  alert.message = `${noUrlErrk}\n✅ 更新成功: ${report.success}\n${upErrk}${
    report.fail.length > 0 ? `\n${report.fail.join(', ')}` : ''
  }\n\n${categoryUpdateResult}`  // 添加 category 更新结果
  alert.addDestructiveAction('重载 Surge')
  alert.addAction('打开 Surge')
  alert.addCancelAction('关闭')
  idx = await alert.presentAlert()
  if (idx == 0) {
    const req = new Request('http://script.hub/reload')
    req.timeoutInterval = 10
    req.method = 'GET'
    try {
      let res = await req.loadString()
      console.log("Surge 重载成功")
    } catch (error) {
      console.error("Surge 重载失败:", error)
    }
  } else if (idx == 1) {
    Safari.open('surge://')
  }
}

if (isCancelled) {
  console.log("操作已取消");
}

// 错误处理和日志记录
try {
  // 这里可以添加一些最终的清理工作或日志记录
  console.log("脚本执行完成");
} catch (error) {
  console.error("脚本执行过程中发生错误:", error);
}

// 确保脚本正确结束
Script.complete();

async function update() {
  const fm = FileManager.iCloud()
  const dict = fm.documentsDirectory()
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


