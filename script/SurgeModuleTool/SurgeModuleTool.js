// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: cloud-download-alt;

// prettier-ignore
let ToolVersion = "1.8";

// 全局变量来标记是否取消操作
let isCancelled = false;

// 统一的错误处理函数
function handleError(error, context) {
  console.error(`Error in ${context}: ${error.message}`);
  let alert = new Alert();
  alert.title = "错误";
  alert.message = `${context}中发生错误：${error.message}`;
  alert.addAction("确定");
  alert.present();
}

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

async function showProgressBar(total, current, message) {
  const width = 300;
  const height = 15;
  const percent = current / total;
  const draw = new DrawContext();
  draw.size = new Size(width, height);
  draw.opaque = false;
  
  // 绘制背景
  draw.setFillColor(new Color("#E0E0E0"));
  draw.fillRect(new Rect(0, 0, width, height));
  
  // 绘制进度
  draw.setFillColor(new Color("#4CAF50"));
  draw.fillRect(new Rect(0, 0, width * percent, height));
  
  // 添加文字
  draw.setFont(Font.mediumSystemFont(12));
  draw.setTextAlignedCenter();
  draw.setTextColor(new Color("#000000"));
  draw.drawTextInRect(`${message} (${Math.round(percent * 100)}%)`, new Rect(0, 0, width, height));
  
  const image = draw.getImage();
  QuickLook.present(image, true);
  await delay(100);  // 短暂延迟以确保UI更新
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
    handleError(e, "检查更新");
    return;
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

// 主要的模块处理函数
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
        filePath
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
        handleError(e, `处理模块 ${currentName || file}`);
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

// 优化的主处理逻辑
async function processFiles() {
  let processedModules = [];
  for (let i = 0; i < files.length; i++) {
    if (isCancelled) break;  // 检查是否取消
    const result = await processModule(folderPath, files[i]);
    if (result) {
      processedModules.push(result);
    }
    await showProgressBar(files.length, i + 1, `处理模块 ${i + 1}/${files.length}`);
  }
  // 文件处理完成后关闭进度条
  QuickLook.present(null);
  await delay(500);  // 稍作延迟，确保进度条被关闭
  return processedModules;
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
          let confirmAlert = new Alert()
          confirmAlert.title = "确认替换"
          confirmAlert.message = `文件 "${module.name}" 已存在。是否替换？`
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
      categoryAlert.title = "选择模块类别";
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
        categoryUpdateResult = `💯分类更新成功：${newCategory}`;
      } else {
        categoryUpdateResult = `⁉️分类未更新：${currentCategory}`;
      }
    } else {
      console.log("用户取消了替换操作")
      isCancelled = true;
    }
  } else {
    categoryUpdateResult = "❌类别无法分类：未处理任何模块";
  }
}

// 结果报告逻辑
if (!checkUpdate && !fromUrlScheme && !isCancelled) {
  let alert = new Alert();
  let upErrk = report.fail.length > 0 ? `❌ 模块更新失败: ${report.fail.length}` : '',
    noUrlErrk = report.noUrl > 0 ? `⚠️ 无链接: ${report.noUrl}` : '';
  alert.title = `📦 模块总数: ${report.success + report.fail.length + report.noUrl}`;
  alert.message = `${noUrlErrk}\n✅ 模块更新成功: ${report.success}\n${upErrk}${
    report.fail.length > 0 ? `\n${report.fail.join(', ')}` : ''
  }\n\n${categoryUpdateResult}`;
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
      handleError(error, "重载 Surge");
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
  handleError(error, "脚本执行");
}

// 确保脚本正确结束
Script.complete();
