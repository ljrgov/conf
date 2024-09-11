// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: cloud-download-alt;

let ToolVersion = "1.0.0";

// Utility Functions
async function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

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
    return text.slice(0, insertIndex) + '\n' + addition + text.slice(insertIndex);
  }
  return text + '\n' + addition;
}

// Main Functions
async function createModuleFromLink(url, name) {
  const req = new Request(url);
  const content = await req.loadString();
  
  if (!content.includes('#!name') || !content.includes('#!desc')) {
    throw new Error('Invalid module content');
  }
  
  let modifiedContent = content;
  if (!modifiedContent.includes('#!category')) {
    const lines = modifiedContent.split('\n');
    lines.splice(1, 0, '#!category=📚未分类');
    modifiedContent = lines.join('\n');
  } else {
    modifiedContent = modifiedContent.replace(/#!category=.*/, '#!category=📚未分类');
  }
  
  modifiedContent = addLineAfterLastOccurrence(modifiedContent, `# 🔗 模块链接\n#SUBSCRIBED ${url}`);
  
  const fileName = `${convertToValidFileName(name)}.sgmodule`;
  const fm = FileManager.iCloud();
  const filePath = fm.joinPath(fm.documentsDirectory(), fileName);
  fm.writeString(filePath, modifiedContent);
  
  return { fileName, filePath };
}

async function updateModule(filePath) {
  const fm = FileManager.iCloud();
  const content = fm.readString(filePath);
  const subscribeMatch = content.match(/#SUBSCRIBED\s+(.*)/);
  if (!subscribeMatch) {
    throw new Error('No subscription URL found');
  }
  
  const url = subscribeMatch[1].trim();
  const req = new Request(url);
  let newContent = await req.loadString();
  
  if (!newContent.includes('#!name') || !newContent.includes('#!desc')) {
    throw new Error('Invalid module content from URL');
  }
  
  const categoryMatch = content.match(/#!category=(.*)/);
  const category = categoryMatch ? categoryMatch[1].trim() : '📚未分类';
  
  newContent = newContent.replace(/#!category=.*/, `#!category=${category}`);
  newContent = addLineAfterLastOccurrence(newContent, `# 🔗 模块链接\n#SUBSCRIBED ${url}`);
  
  fm.writeString(filePath, newContent);
  return { fileName: fm.fileName(filePath), filePath, newContent };
}

async function updateAllModules(folderPath) {
  const fm = FileManager.iCloud();
  const files = fm.listContents(folderPath).filter(file => file.endsWith('.sgmodule'));
  const results = [];
  
  for (const file of files) {
    const filePath = fm.joinPath(folderPath, file);
    try {
      const result = await updateModule(filePath);
      results.push({ success: true, ...result });
    } catch (error) {
      results.push({ success: false, fileName: file, error: error.message });
    }
  }
  
  return results;
}

async function classifyModule(filePath) {
  const fm = FileManager.iCloud();
  const alert = new Alert();
  alert.title = '模块分类';
  alert.message = `当前模块: ${fm.fileName(filePath)}`;
  alert.addAction('📙广告模块');
  alert.addAction('📗功能模块');
  alert.addAction('📘面板模块');
  alert.addAction('📚取消分类');
  
  const choice = await alert.presentAlert();
  const categories = ['📙广告模块', '📗功能模块', '📘面板模块', '📚未分类'];
  const newCategory = categories[choice];
  
  if (choice !== 3) {  // Not "取消分类"
    let content = fm.readString(filePath);
    content = content.replace(/#!category=.*/, `#!category=${newCategory}`);
    fm.writeString(filePath, content);
    return { success: true, newCategory };
  }
  
  return { success: false, newCategory: '未更改' };
}

async function updateScript() {
  const scriptURL = "https://raw.githubusercontent.com/ljrgov/conf/main/script/SurgeModuleTool/SurgeModuleTool.js";
  const req = new Request(scriptURL);
  try {
    const newScript = await req.loadString();
    const versionMatch = newScript.match(/let ToolVersion = "([\d.]+)"/);
    if (versionMatch) {
      const onlineVersion = versionMatch[1];
      if (onlineVersion > ToolVersion) {
        const fm = FileManager.iCloud();
        const scriptPath = module.filename;
        fm.writeString(scriptPath, newScript);
        return { updated: true, newVersion: onlineVersion };
      } else {
        return { updated: false, message: "Already up to date." };
      }
    } else {
      throw new Error("无法获取在线版本号");
    }
  } catch (error) {
    console.error("更新脚本时出错:", error);
    return { updated: false, error: error.message };
  }
}

// Main logic
async function main() {
  let fromUrlScheme = args.queryParameters.url ? true : false;
  let idx;

  if (fromUrlScheme) {
    idx = 0;  // From link creation
  } else {
    let alert = new Alert();
    alert.title = 'Surge 模块工具';
    alert.addAction('从链接创建');
    alert.addAction('更新单个模块');
    alert.addAction('更新全部模块');
    alert.addAction('更新本脚本');
    alert.addCancelAction('取消');
    idx = await alert.presentAlert();
  }

  let report = {
    success: 0,
    fail: [],
    noUrl: 0,
    classified: 0,
    unclassified: 0
  };

  try {
    if (idx === 0) {  // From link creation
      let url, name;
      if (fromUrlScheme) {
        url = args.queryParameters.url;
        name = args.queryParameters.name || '';
      } else {
        let alert = new Alert();
        alert.title = '创建新模块';
        alert.addTextField('链接(必填)', '');
        alert.addTextField('名称(选填)', '');
        alert.addAction('下载');
        alert.addCancelAction('取消');
        await alert.presentAlert();
        url = alert.textFieldValue(0);
        name = alert.textFieldValue(1);
      }
      
      if (!url) throw new Error('URL is required');
      if (!name) {
        const plainUrl = url.split('?')[0];
        name = plainUrl.substring(plainUrl.lastIndexOf('/') + 1).replace(/\.sgmodule$/, '') || `untitled-${new Date().toLocaleString()}`;
      }
      
      const { fileName, filePath } = await createModuleFromLink(url, name);
      report.success++;
      
      const classResult = await classifyModule(filePath);
      if (classResult.success) {
        report.classified++;
        console.log(`Module classified as: ${classResult.newCategory}`);
      } else {
        report.unclassified++;
      }
    } else if (idx === 1) {  // Update single module
      const filePath = await DocumentPicker.openFile();
      const result = await updateModule(filePath);
      report.success++;
      console.log(`Updated module: ${result.fileName}`);
      
      const classResult = await classifyModule(filePath);
      if (classResult.success) {
        report.classified++;
        console.log(`Module classified as: ${classResult.newCategory}`);
      } else {
        report.unclassified++;
      }
    } else if (idx === 2) {  // Update all modules
      const folderPath = await DocumentPicker.openFolder();
      const results = await updateAllModules(folderPath);
      
      for (const result of results) {
        if (result.success) {
          report.success++;
          const classResult = await classifyModule(result.filePath);
          if (classResult.success) {
            report.classified++;
          } else {
            report.unclassified++;
          }
        } else {
          if (result.error.includes('No subscription URL found')) {
            report.noUrl++;
          } else {
            report.fail.push(result.fileName);
          }
        }
      }
    } else if (idx === 3) {  // Update script
      const updateResult = await updateScript();
      if (updateResult.updated) {
        console.log(`脚本已更新到版本 ${updateResult.newVersion}`);
        let alert = new Alert();
        alert.title = '脚本更新成功';
        alert.message = `已更新到版本 ${updateResult.newVersion}。\n请重新运行脚本以使用新版本。`;
        alert.addAction('确定');
        await alert.present();
        return;
      } else if (updateResult.error) {
        console.log(`更新失败: ${updateResult.error}`);
        let alert = new Alert();
        alert.title = '脚本更新失败';
        alert.message = updateResult.error;
        alert.addAction('确定');
        await alert.present();
      } else {
        console.log(updateResult.message);
        let alert = new Alert();
        alert.title = '脚本已是最新版本';
        alert.message = updateResult.message;
        alert.addAction('确定');
        await alert.present();
      }
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    report.fail.push(error.message);
  }

  // Display report
  let message = `📦 模块总数: ${report.success + report.fail.length + report.noUrl}\n`;
  message += `✅ 更新成功: ${report.success}\n`;
  message += `📊 已分类: ${report.classified}\n`;
  message += `🏷️ 未分类: ${report.unclassified}\n`;
  if (report.noUrl > 0) message += `🈚️ 无链接: ${report.noUrl}\n`;
  if (report.fail.length > 0) message += `❌ 更新失败: ${report.fail.length}\n${report.fail.join(', ')}\n`;

  let alert = new Alert();
  alert.title = 'Surge 模块工具 - 结果报告';
  alert.message = message;
  alert.addAction('重载 Surge');
  alert.addAction('打开 Surge');
  alert.addCancelAction('关闭');

  const finalChoice = await alert.presentAlert();
  if (finalChoice === 0) {
    const req = new Request('http://script.hub/reload');
    req.timeoutInterval = 10;
    req.method = 'GET';
    await req.loadString();
  } else if (finalChoice === 1) {
    Safari.open('surge://');
  }
}

// Run the main function
await main();
Script.complete();
