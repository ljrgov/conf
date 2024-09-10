// prettier-ignore
let ToolVersion = "200";

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

// 更新后的内容比较函数，忽略 category 和 desc
function compareContentIgnoringCategoryAndDesc(content1, content2) {
  const lines1 = content1.split('\n');
  const lines2 = content2.split('\n');
  
  if (lines1.length !== lines2.length) return false;
  
  for (let i = 0; i < lines1.length; i++) {
    const line1 = lines1[i].trim().toLowerCase();
    const line2 = lines2[i].trim().toLowerCase();
    
    if (line1.startsWith('#!category') || line1.startsWith('#!desc')) continue;
    if (line1 !== line2) return false;
  }
  
  return true;
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

async function processModule(folderPath, file) {
  if (isCancelled) return null;
  if (file && !/\.(conf|txt|js|list)$/i.test(file)) {
    let currentName, currentDesc, currentCategory, noUrl;
    try {
      let content;
      let filePath = `${folderPath}/${file}`;
      if (contents.length > 0) {
        content = contents[files.indexOf(file)];
      } else {
        content = fm.readString(filePath);
      }

      const nameMatched = content.match(/^#\!name\s*?=\s*(.*?)\s*(\n|$)/im);
      if (nameMatched) {
        currentName = nameMatched[1];
      }

      const descMatched = content.match(/^#\!desc\s*?=\s*(.*?)\s*(\n|$)/im);
      if (descMatched) {
        currentDesc = descMatched[1];
        if (currentDesc) {
          currentDesc = currentDesc.replace(/^🔗.*?]\s*/i, '');
        }
      }

      const categoryRegex = /^#!category\s*?=\s*(.*?)\s*$/im;
      const categoryMatch = content.match(categoryRegex);
      if (categoryMatch) {
        currentCategory = categoryMatch[1];
      }

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

      const req = new Request(url);
      req.timeoutInterval = 10;
      req.method = 'GET';
      let res = await req.loadString();
      const statusCode = req.response.statusCode;
      if (statusCode < 200 || statusCode >= 400) {
        throw new Error(`statusCode: ${statusCode}`);
      }
      if (!res) {
        throw new Error(`未获取到模块内容`);
      }

      const newNameMatched = res.match(/^#\!name\s*?=\s*?\s*(.*?)\s*(\n|$)/im);
      if (!newNameMatched) {
        throw new Error(`不是合法的模块内容`);
      }
      const newName = newNameMatched[1];
      if (!newName) {
        throw new Error('模块无名称字段');
      }

      const newDescMatched = res.match(/^#\!desc\s*?=\s*?\s*(.*?)\s*(\n|$)/im);
      let newDesc = newDescMatched ? newDescMatched[1] : '';

      if (!newDescMatched) {
        res = `#!desc=\n${res}`;
      }
      res = res.replace(/^(#SUBSCRIBED|# 🔗 模块链接)(.*?)(\n|$)/gim, '');
      res = addLineAfterLastOccurrence(res, `\n\n# 🔗 模块链接\n${subscribed.replace(/\n/g, '')}\n`);
      content = res.replace(/^#\!desc\s*?=\s*/im, `#!desc=🔗 [${new Date().toLocaleString()}] `);

      // 设置初始分类值
      if (!categoryRegex.test(content)) {
        content = content.replace(/^(#!name.*?)$/im, `$1\n#!category=📚未分类`);
      } else {
        content = content.replace(categoryRegex, `#!category=📚未分类`);
      }

      return {
        content,
        name: newName,
        desc: newDesc,
        category: "📚未分类",
        filePath,
        originalContent: fm.fileExists(filePath) ? fm.readString(filePath) : null
      };
    } catch (e) {
      if (noUrl) {
        report.noUrl += 1;
      } else {
        report.fail.push(currentName || file);
      }

      if (noUrl) {
        console.log(`\n⚠️ ${currentName || ''}\n${file}`);
        console.log(e);
      } else {
        console.log(`\n❌ ${currentName || ''}\n${file}`);
        console.error(`${currentName || file}: ${e}`);
      }
      if (fromUrlScheme) {
        alert = new Alert();
        alert.title = `❌ ${currentName || ''}\n${file}`;
        alert.message = `${e.message || e}`;
        alert.addCancelAction('关闭');
        await alert.presentAlert();
      }
    }
  }
  return null;
}

// 更新 category 的函数
function updateCategory(content, newCategory) {
  const categoryRegex = /^#!category\s*?=.*?$/im;
  if (categoryRegex.test(content)) {
    return content.replace(categoryRegex, `#!category=${newCategory}`);
  } else {
    return content.replace(/^(#!name.*?)$/im, `$1\n#!category=${newCategory}`);
  }
}

// 简化的主处理逻辑
async function processFiles() {
  let processedModules = [];
  for (const file of files) {
    if (isCancelled) break;  // 检查是否取消
    const result = await processModule(folderPath, file);
    if (result) {
      processedModules.push(result);
    }
  }
  return processedModules;
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
    folderPath = await DocumentPicker.openFolder()
    if (!folderPath) {
      isCancelled = true;
    }
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

// 执行主处理逻辑
if (idx >= 1 && idx <= 3 && !isCancelled) {
  let processedModules = await processFiles();

  if (!isCancelled && processedModules.length > 0) {
    let shouldWrite = true;
    
    // 只有在从链接创建时才显示替换确认对话框
    if (idx == 1) {
      for (const module of processedModules) {
        if (fm.fileExists(module.filePath)) {
          let isContentSame = compareContentIgnoringCategoryAndDesc(module.content, module.originalContent);
          let contentComparisonText = isContentSame ? "文件内容一致" : "文件内容不一致";
          let contentComparisonSymbol = isContentSame ? "" : "❗️";
          
          let confirmAlert = new Alert()
          confirmAlert.title = "文件替换"
          confirmAlert.message = `文件 "${module.name}"\n\n${contentComparisonSymbol}${contentComparisonText}${contentComparisonSymbol}`;
          confirmAlert.addAction("替换")
          confirmAlert.addCancelAction("取消")
          let confirmResult = await confirmAlert.presentAlert()

          if (confirmResult === -1) {  // 用户选择取消
            shouldWrite = false;
            break;
          }
        }
      }
    }

    if (shouldWrite) {
      // 写入处理后的内容到文件
      for (const module of processedModules) {
        fm.writeString(module.filePath, module.content)
      }
      console.log(`已更新 ${processedModules.length} 个文件`)
      report.success = processedModules.length;

      // 处理类别（Category）
      let currentCategory = processedModules[0].category;
      let currentName = processedModules[0].name;

      let categoryAlert = new Alert();
      categoryAlert.title = "模块分类";
      categoryAlert.message = 
      `模块名称：${currentName}\n模块类别：${currentCategory}\n处理的模块数：${processedModules.length}`;
      categoryAlert.addAction("📙广告模块");
      categoryAlert.addAction("📗功能模块");
      categoryAlert.addAction("📘面板模块");
      categoryAlert.addCancelAction("取消");
      let categoryChoice = await categoryAlert.presentAlert();
      
      if (categoryChoice !== -1) {
        let newCategory;
        switch(categoryChoice) {
          case 0: newCategory = "📙广告模块"; break;
          case 1: newCategory = "📗功能模块"; break;
          case 2: newCategory = "📘面板模块"; break;
        }
        for (let module of processedModules) {
          module.content = updateCategory(module.content, newCategory);
          module.category = newCategory;
        }
        // 再次写入文件以更新类别
        for (const module of processedModules) {
          fm.writeString(module.filePath, module.content)
        }
        categoryUpdateResult = `✅分类更新成功：${newCategory}`;
      } else {
        categoryUpdateResult = `⚠️分类未更新：${currentCategory}`;
      }
    } else {
      console.log("用户取消了替换操作")
      isCancelled = true;
    }
  } else {
    categoryUpdateResult = "‼️类别分类失败：模块URL错误";
  }
}

// 结果报告逻辑
if (!checkUpdate && !fromUrlScheme && !isCancelled) {
  let alert = new Alert();
  let totalModules = report.success + report.fail.length + report.noUrl;
  
  alert.title = `📦 模块总数: ${totalModules}`;
  
  let messageComponents = [''];  // 在开头添加一个空行
  
  if (report.success > 0) {
    messageComponents.push(`✅ 模块更新成功: ${report.success}`, '');
    if (categoryUpdateResult) {
      messageComponents.push(categoryUpdateResult, '');
    }
  }
  
  if (report.fail.length > 0) {
    messageComponents.push(`❌ 模块更新失败: ${report.fail.length}`, '');
  }
  
  if (report.noUrl > 0) {
    messageComponents.push(`⚠️ 无链接: ${report.noUrl}`, '');
  }
  
  if (report.fail.length > 0) {
    messageComponents.push(`⚠️ 无效链接:`, report.fail.join('\n'), '');
  }
  
  // 移除最后一个空字符串，避免在消息末尾出现多余的空行
  if (messageComponents[messageComponents.length - 1] === '') {
    messageComponents.pop();
  }

  alert.message = messageComponents.join('\n');

  alert.addDestructiveAction('重载 Surge');
  alert.addAction('打开 Surge');
  alert.addCancelAction('关闭');

  idx = await alert.presentAlert();
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
  console.log("脚本执行完成");
} catch (error) {
  console.error("脚本执行过程中发生错误:", error);
}

// 确保脚本正确结束
Script.complete();