// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: cloud-download-alt;

let ToolVersion = "1.2";

async function delay(milliseconds) {
  var before = Date.now()
  while (Date.now() < before + milliseconds) {}
  return true
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

function processModuleContent(content) {
  const defaultCategory = "📚未分类";
  let categoryMatch = content.match(/#!category\s*=\s*(.*)/);
  
  if (categoryMatch) {
    content = content.replace(/#!category\s*=\s*.*/, `#!category = ${defaultCategory}`);
  } else {
    content = `#!category = ${defaultCategory}\n${content}`;
  }
  
  return content;
}

async function showCategoryDialog(moduleName, currentCategory) {
  let alert = new Alert();
  alert.title = "选择分类";
  alert.message = `模块：${moduleName}\n当前分类：${currentCategory}`;
  alert.addAction("广告屏蔽");
  alert.addAction("面板展示");
  alert.addAction("功能集成");
  alert.addCancelAction("保持当前分类");
  
  let choice = await alert.presentAlert();
  
  switch(choice) {
    case 0: return "广告屏蔽";
    case 1: return "面板展示";
    case 2: return "功能集成";
    default: return null;
  }
}

function updateModuleCategory(content, category) {
  if (category) {
    return content.replace(/#!category\s*=\s*.*/, `#!category = ${category}`);
  }
  return content;
}

function extractCurrentCategory(content) {
  let match = content.match(/#!category\s*=\s*(.*)/);
  return match ? match[1].trim() : "📚未分类";
}

function generateCategory(modules) {
  let categories = {};
  
  for (let module of modules) {
    let content = fm.readString(module.path);
    let categoryMatch = content.match(/#!category\s*=\s*(.*)/);
    let category = categoryMatch ? categoryMatch[1].trim() : "未分类";
    
    if (!categories[category]) {
      categories[category] = [];
    }
    categories[category].push(module.name);
  }
  
  let categoryContent = "# Surge 模块分类\n\n";
  for (let [category, moduleNames] of Object.entries(categories)) {
    categoryContent += `## ${category}\n`;
    for (let moduleName of moduleNames) {
      categoryContent += `- ${moduleName}\n`;
    }
    categoryContent += "\n";
  }
  
  return categoryContent;
}

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

async function main() {
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
    alert.addAction('从链接创建')
    alert.addAction('更新单个模块')
    alert.addAction('更新全部模块')
    alert.addAction('生成分类列表')
    alert.addDestructiveAction('更新本脚本')
    alert.addCancelAction('取消')
    idx = await alert.presentAlert()
  }

  let folderPath
  let files = []
  let contents = []
  const fm = FileManager.iCloud()

  let report = {
    success: 0,
    fail: [],
    noUrl: 0,
  }

  if (idx === 0) { // 从链接创建
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
      
      try {
        const req = new Request(url)
        req.timeoutInterval = 10
        req.method = 'GET'
        let content = await req.loadString()
        content = processModuleContent(content)
        let currentCategory = extractCurrentCategory(content)
        let category = await showCategoryDialog(name, currentCategory)
        content = updateModuleCategory(content, category)
        await DocumentPicker.exportString(content, files[0])
        report.success++
      } catch (e) {
        console.error(`下载失败: ${e}`)
        report.fail.push(name)
      }
    }
  } else if (idx === 1) { // 更新单个模块
    const filePath = await DocumentPicker.openFile()
    folderPath = filePath.substring(0, filePath.lastIndexOf('/'))
    files = [filePath.substring(filePath.lastIndexOf('/') + 1)]
    
    try {
      let content = fm.readString(filePath)
      content = processModuleContent(content)
      let currentCategory = extractCurrentCategory(content)
      let category = await showCategoryDialog(files[0], currentCategory)
      content = updateModuleCategory(content, category)
      fm.writeString(filePath, content)
      report.success++
    } catch (e) {
      console.error(`更新失败: ${e}`)
      report.fail.push(files[0])
    }
  } else if (idx === 2) { // 更新全部模块
    folderPath = await DocumentPicker.openFolder()
    files = fm.listContents(folderPath).filter(file => file.endsWith('.sgmodule'))
    
    // 为所有模块选择一次分类
    if (files.length > 0) {
      let sampleContent = fm.readString(`${folderPath}/${files[0]}`)
      let currentCategory = extractCurrentCategory(sampleContent)
      let category = await showCategoryDialog("所有模块", currentCategory)
      
      for (let file of files) {
        try {
          let filePath = `${folderPath}/${file}`
          let content = fm.readString(filePath)
          content = processModuleContent(content)
          content = updateModuleCategory(content, category)
          fm.writeString(filePath, content)
          report.success++
        } catch (e) {
          console.error(`更新失败 ${file}: ${e}`)
          report.fail.push(file)
        }
      }
    }
  } else if (idx === 3) { // 生成分类列表
    folderPath = await DocumentPicker.openFolder()
    files = fm.listContents(folderPath).filter(file => file.endsWith('.sgmodule'))
    let modules = files.map(file => ({
      name: file,
      path: `${folderPath}/${file}`
    }))
    
    let categoryContent = generateCategory(modules)
    let categoryFilePath = `${folderPath}/模块分类.md`
    fm.writeString(categoryFilePath, categoryContent)
    
    console.log("分类列表已生成：", categoryFilePath)
    
    let resultAlert = new Alert()
    resultAlert.title = "分类生成完成"
    resultAlert.message = `分类列表已保存至：${categoryFilePath}`
    resultAlert.addAction("确定")
    await resultAlert.presentAlert()
  } else if (idx === 4) { // 更新本脚本
    console.log('检查更新')
    checkUpdate = true
    await update()
  }

  if (!checkUpdate && !fromUrlScheme) {
    alert = new Alert()
    let upErrk = report.fail.length > 0 ? `❌ 更新失败: ${report.fail.length}` : '',
      noUrlErrk = report.noUrl > 0 ? `🈚️ 无链接: ${report.noUrl}` : ''
    alert.title = `📦 模块总数: ${report.success + report.fail.length + report.noUrl}`
    alert.message = `${noUrlErrk}\n✅ 更新成功: ${report.success}\n${upErrk}${
      report.fail.length > 0 ? `\n${report.fail.join(', ')}` : ''
    }`
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
}

await main();





