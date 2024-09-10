// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: cloud-download-alt;

let ToolVersion = "2.3"; // Updated version number

// Global variables
let isCancelled = false;
const fm = FileManager.iCloud();

// Helper functions
function convertToValidFileName(str) {
  const invalidCharsRegex = /[\/:*?"<>|]/g;
  const validFileName = str.replace(invalidCharsRegex, '_');
  const multipleDotsRegex = /\.{2,}/g;
  const fileNameWithoutMultipleDots = validFileName.replace(multipleDotsRegex, '.');
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

async function delay(milliseconds) {
  return new Promise(resolve => Timer.schedule(milliseconds / 1000, false, () => resolve()));
}

// Main processing function
async function processModule(folderPath, file, content) {
  if (isCancelled || !/\.(conf|txt|js|list|sgmodule)$/i.test(file)) return null;

  try {
    const filePath = `${folderPath}/${file}`;
    content = content || fm.readString(filePath);

    const nameMatch = content.match(/^#!name\s*=\s*(.*?)\s*$/im);
    const descMatch = content.match(/^#!desc\s*=\s*(.*?)\s*$/im);
    const categoryMatch = content.match(/^#!category\s*=\s*(.*?)\s*$/im);
    const urlMatch = content.match(/^#SUBSCRIBED\s+(.*?)\s*(\n|$)/im);

    if (!nameMatch) throw new Error('模块无名称字段');
    if (!urlMatch) throw new Error('无订阅链接');

    const moduleName = nameMatch[1].trim();
    const moduleDesc = descMatch ? descMatch[1].trim() : '';
    const moduleCategory = categoryMatch ? categoryMatch[1].trim() : '';
    const url = urlMatch[1].trim();

    const req = new Request(url);
    req.timeoutInterval = 10;
    const res = await req.loadString();
    if (req.response.statusCode < 200 || req.response.statusCode >= 400) {
      throw new Error(`statusCode: ${req.response.statusCode}`);
    }

    const newNameMatch = res.match(/^#!name\s*=\s*(.*?)\s*$/im);
    const newDescMatch = res.match(/^#!desc\s*=\s*(.*?)\s*$/im);

    if (!newNameMatch) throw new Error('更新后的模块无名称字段');

    const newModuleName = newNameMatch[1].trim();
    const newModuleDesc = newDescMatch ? newDescMatch[1].trim() : '';

    let updatedContent = res.replace(/^(#SUBSCRIBED|# 🔗 模块链接)(.*?)(\n|$)/gim, '');
    updatedContent = addLineAfterLastOccurrence(updatedContent, `\n\n# 🔗 模块链接\n#SUBSCRIBED ${url}\n`);
    updatedContent = updatedContent.replace(/^#!desc\s*=\s*/im, `#!desc=🔗 [${new Date().toLocaleString()}] `);

    if (!/^#!category/im.test(updatedContent)) {
      updatedContent = updatedContent.replace(/^(#!name.*?)$/im, `$1\n#!category=${moduleCategory || '📚未分类'}`);
    } else if (moduleCategory) {
      updatedContent = updatedContent.replace(/^#!category.*?$/im, `#!category=${moduleCategory}`);
    }

    return { 
      content: updatedContent, 
      oldName: moduleName, 
      newName: newModuleName, 
      oldDesc: moduleDesc,
      newDesc: newModuleDesc,
      category: moduleCategory || '📚未分类',
      filePath 
    };
  } catch (e) {
    console.error(`Error processing ${file}: ${e.message}`);
    return null;
  }
}

async function update() {
  const dict = fm.documentsDirectory();
  const scriptName = 'SurgeModuleTool';
  let version;
  let resp;
  try {
    const url = 'https://raw.githubusercontent.com/ljrgov/conf/main/script/SurgeModuleTool/SurgeModuleTool.js?v=' + Date.now();
    let req = new Request(url);
    req.method = 'GET';
    req.headers = {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    };
    resp = await req.loadString();

    const regex = /let ToolVersion = "([\d.]+)"/;
    const match = resp.match(regex);
    version = match ? match[1] : '';
  } catch (e) {
    console.error(e);
  }

  if (!version) {
    let alert = new Alert();
    alert.title = 'Surge 模块工具';
    alert.message = '无法获取在线版本';
    alert.addCancelAction('关闭');
    await alert.presentAlert();
    return;
  } else {
    let needUpdate = version > ToolVersion;
    if (!needUpdate) {
      let alert = new Alert();
      alert.title = 'Surge 模块工具';
      alert.message = `当前版本: ${ToolVersion}\n在线版本: ${version}\n无需更新`;
      alert.addDestructiveAction('强制更新');
      alert.addCancelAction('关闭');
      let idx = await alert.presentAlert();
      if (idx === 0) {
        needUpdate = true;
      }
    }
    if (needUpdate) {
      fm.writeString(`${dict}/${scriptName}.js`, resp);
      console.log('更新成功: ' + version);
      let notification = new Notification();
      notification.title = 'Surge 模块工具 更新成功: ' + version;
      notification.subtitle = '点击通知跳转';
      notification.sound = 'default';
      notification.openURL = `scriptable:///open/${scriptName}`;
      notification.addAction('打开脚本', `scriptable:///open/${scriptName}`, false);
      await notification.schedule();
    }
  }
}

// Main execution logic
async function main() {
  let idx;
  let fromUrlScheme = args.queryParameters.url ? true : false;

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
    if (idx === -1) {
      isCancelled = true;
    }
  }

  if (isCancelled) {
    console.log("操作已取消");
    return;
  }

  let folderPath;
  let files = [];
  let contents = [];

  let report = {
    success: 0,
    fail: [],
    noUrl: 0,
  };

  if (idx === 3 || idx === 2) { // 更新全部模块或更新单个模块
    if (idx === 3) {
      folderPath = await DocumentPicker.openFolder();
      if (!folderPath) {
        isCancelled = true;
      } else {
        files = fm.listContents(folderPath);
      }
    } else {
      const filePath = await DocumentPicker.openFile();
      if (!filePath) {
        isCancelled = true;
      } else {
        folderPath = filePath.substring(0, filePath.lastIndexOf('/'));
        files = [filePath.substring(filePath.lastIndexOf('/') + 1)];
      }
    }

    if (isCancelled) {
      console.log("操作已取消");
      return;
    }

    let processedModules = [];
    for (const file of files) {
      const result = await processModule(folderPath, file, contents[files.indexOf(file)]);
      if (result) {
        processedModules.push(result);
      } else {
        if (/\.(conf|txt|js|list|sgmodule)$/i.test(file)) {
          report.fail.push(file);
        } else {
          report.noUrl++;
        }
      }
    }

    if (!isCancelled && processedModules.length > 0) {
      let shouldWrite = true;
      
      if (idx === 2) {
        let confirmAlert = new Alert();
        confirmAlert.title = "确认替换";
        confirmAlert.message = `文件 "${processedModules[0].newName}.sgmodule" 已存在。是否替换？`;
        confirmAlert.addAction("替换");
        confirmAlert.addCancelAction("取消");
        let confirmResult = await confirmAlert.presentAlert();
        if (confirmResult === -1) {  // 用户选择取消
          shouldWrite = false;
        }
      }

      if (shouldWrite) {
        for (const module of processedModules) {
          const newFilePath = `${folderPath}/${convertToValidFileName(module.newName)}.sgmodule`;
          if (fm.fileExists(newFilePath) && newFilePath !== module.filePath) {
            let confirmAlert = new Alert();
            confirmAlert.title = "确认替换";
            confirmAlert.message = `文件 "${module.newName}.sgmodule" 已存在。是否替换？`;
            confirmAlert.addAction("替换");
            confirmAlert.addCancelAction("跳过");
            let confirmResult = await confirmAlert.presentAlert();

            if (confirmResult === -1) {  // 用户选择跳过
              continue;
            }
          }

          fm.writeString(newFilePath, module.content);

          if (newFilePath !== module.filePath) {
            fm.remove(module.filePath);
          }
          report.success++;
        }
        console.log(`已更新 ${report.success} 个文件`);
        
        // Category selection
        let categoryAlert = new Alert();
        categoryAlert.title = "选择模块类别";
        categoryAlert.message = `处理的模块数：${processedModules.length}`;
        categoryAlert.addAction("📙广告模块");
        categoryAlert.addAction("📗功能模块");
        categoryAlert.addAction("📘面板模块");
        categoryAlert.addCancelAction("取消");
        let categoryChoice = await categoryAlert.presentAlert();
        
        let categoryUpdateResult = '';
        if (categoryChoice !== -1) {
          let newCategory;
          switch(categoryChoice) {
            case 0: newCategory = "📙广告模块"; break;
            case 1: newCategory = "📗功能模块"; break;
            case 2: newCategory = "📘面板模块"; break;
          }
          for (const module of processedModules) {
            const filePath = `${folderPath}/${convertToValidFileName(module.newName)}.sgmodule`;
            let content = fm.readString(filePath);
            content = content.replace(/^#!category.*?$/im, `#!category=${newCategory}`);
            fm.writeString(filePath, content);
          }
          categoryUpdateResult = `💯分类更新成功：${newCategory}`;
          console.log(categoryUpdateResult);
        } else {
          categoryUpdateResult = "⁉️分类未更新";
          console.log(categoryUpdateResult);
        }
      } else {
        console.log("用户取消了替换操作");
      }
    } else {
      console.log("未处理任何模块");
    }
  } else if (idx === 1) {
    // 从链接创建
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
      let result = await alert.presentAlert();
      if (result === -1) {
        isCancelled = true;
      } else {
        url = alert.textFieldValue(0);
        name = alert.textFieldValue(1);
      }
    }
    if (!isCancelled && url) {
      if (!name) {
        const plainUrl = url.split('?')[0];
        const fullname = plainUrl.substring(plainUrl.lastIndexOf('/') + 1);
        if (fullname) {
          name = fullname.replace(/\.sgmodule$/, '');
        }
        if (!name) {
          name = `untitled-${new Date().toLocaleString()}`;
        }
      }
      name = convertToValidFileName(name);
      folderPath = await DocumentPicker.openFolder();
      if (!folderPath) {
        isCancelled = true;
      } else {
        const result = await processModule(folderPath, `${name}.sgmodule`, `#SUBSCRIBED ${url}`);
        if (result) {
          const newFilePath = `${folderPath}/${convertToValidFileName(result.newName)}.sgmodule`;
          fm.writeString(newFilePath, result.content);
          console.log(`模块已创建：${result.newName}`);
          report.success = 1;
        } else {
          console.log("模块创建失败");
          report.fail.push(name);
        }
      }
    }
  } else if (idx === 0) {
    console.log('检查更新');
    await update();
    return;
  }

  // Result reporting
  if (!fromUrlScheme && !isCancelled) {
    let alert = new Alert();
    let upError = report.fail.length > 0 ? `❌ 模块更新失败: ${report.fail.length}` : '';
    let noUrlError = report.noUrl > 0 ? `⚠️ 无链接: ${report.noUrl}` : '';
    alert.title = `📦 模块总数: ${report.success + report.fail.length + report.noUrl}`;
    alert.message = `${noUrlError}\n✅ 模块更新成功: ${report.success}\n${upError}${
      report.fail.length > 0 ? `\n${report.fail.join(', ')}` : ''
    }\n\n${categoryUpdateResult || ''}`;
    alert.addDestructiveAction('重载 Surge');
    alert.addAction('打开 Surge');
    alert.addCancelAction('关闭');
    let finalChoice = await alert.presentAlert();
    if (finalChoice === 0) {
      const req = new Request('http://script.hub/reload');
      req.timeoutInterval = 10;
      req.method = 'GET';
      try {
        await req.loadString();
        console.log("Surge 重载成功");
      } catch (error) {
        console.error("Surge 重载失败:", error);
      }
    } else if (finalChoice === 1) {
      Safari.open('surge://');
    }
  }
}

// Start the script
main().catch(console.error).finally(() => Script.complete());

