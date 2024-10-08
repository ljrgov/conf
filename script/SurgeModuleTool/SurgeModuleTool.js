// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: pink; icon-glyph: cloud-download-alt;

// prettier-ignore
let ToolVersion = "2.08";

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

async function updateModules(files, folderPath, contents = [], isBulkUpdate = false) {
  let report = {
    success: 0,
    fail: [],
    noUrl: [],
    categories: {
      "📙广告模块": 0,
      "📘功能模块": 0,
      "📗面板模块": 0,
      "📚未分类": 0
    }
  };

  // 只在批量更新时进行全局分类选择
  let globalCategory = null;
  if (isBulkUpdate) {
    const totalModules = files.filter(file => !/\.(conf|txt|js|list)$/i.test(file)).length;
    let alert = new Alert();
    alert.title = "选择全局模块分类";
    alert.message = `需要处理的模块总数: ${totalModules}`;
    alert.addAction("📙广告模块");
    alert.addAction("📘功能模块");
    alert.addAction("📗面板模块");
    alert.addAction("📚保持各自原有分类");
    let choice = await alert.presentAlert();
    const categories = ["📙广告模块", "📘功能模块", "📗面板模块", null];
    globalCategory = categories[choice];
  }

  for await (const [index, file] of files.entries()) {
    if (file && !/\.(conf|txt|js|list)$/i.test(file)) {
      try {
        // 读取文件内容
        let content = contents[index] || await readFileContent(file, folderPath);

        // 解析原始信息和订阅链接
        let originalCategory = extractInfo(content, 'category');
        const subscribeMatch = content.match(/^#SUBSCRIBED\s+(.*?)\s*(\n|$)/im);
        if (!subscribeMatch) {
          report.noUrl.push(file.replace('.sgmodule', ''));
          continue;
        }
        const url = subscribeMatch[1];

        // 下载新内容
        let newContent;
        try {
          newContent = await downloadContent(url);
        } catch (error) {
          let alert = new Alert();
          alert.title = '⚠️ 警告';
          alert.message = '无效URL：下载模块内容失败';
          alert.addAction('确定');
          await alert.presentAlert();
          return null;
        }

        // 解析新内容
        let newName = extractInfo(newContent, 'name') || extractInfo(content, 'name');
        let newDesc = extractInfo(newContent, 'desc') || extractInfo(content, 'desc');

        // 确定最终使用的分类
        let finalCategory;
        if (isBulkUpdate) {
          finalCategory = globalCategory || originalCategory || "📚未分类";
        } else {
          // 对单个模块更新或从链接创建时，保持原有的分类选择逻辑
          let alert = new Alert();
          alert.title = "选择模块分类";
          alert.message = `当前模块名称: ${newName}\n当前分类: ${originalCategory || "📚未分类"}`;
          alert.addAction("📙广告模块");
          alert.addAction("📘功能模块");
          alert.addAction("📗面板模块");
          alert.addAction("📚保持当前分类");
          let choice = await alert.presentAlert();
          const categories = ["📙广告模块", "📘功能模块", "📗面板模块", originalCategory || "📚未分类"];
          finalCategory = categories[choice];
        }

        // 更新内容
        let updatedContent = newContent;

        // 更新 name 和 desc
        updatedContent = updatedContent.replace(/^#!name=.*$/m, `#!name=${newName}`);
        updatedContent = updatedContent.replace(/^#!desc=.*$/m, `#!desc=🔗 [${new Date().toLocaleString()}] ${newDesc}`);

        // 移除原有的 category 和 #SUBSCRIBED 行（如果存在）
        updatedContent = updatedContent.replace(/^#!category=.*\n?/m, '');
        updatedContent = updatedContent.replace(/^#SUBSCRIBED.*\n?/m, '');

        // 找到最后一个元数据行的位置
        const contentLines = updatedContent.split('\n');
        const lastMetadataIndex = contentLines.findLastIndex(line => line.startsWith('#!'));

        if (lastMetadataIndex !== -1) {
          // 在最后一个元数据行后插入新的内容
          contentLines.splice(lastMetadataIndex + 1, 0, 
            `#!category=${finalCategory}`,
            '',
            '# 🔗 模块链接',
            `#SUBSCRIBED ${url}`,
            '' // 额外的空行
          );
        } else {
          // 如果没有元数据，就在开头添加新的内容
          contentLines.unshift(
            `#!category=${finalCategory}`,
            '',
            '# 🔗 模块链接',
            `#SUBSCRIBED ${url}`,
            '' // 额外的空行
          );
        }

        updatedContent = contentLines.join('\n');

        // 更新报告中的分类计数
        report.categories[finalCategory]++;

        // 保存更新后的内容
        await saveFileContent(file, folderPath, updatedContent);

        console.log(`✅ 更新成功: ${file}`);
        report.success += 1;

      } catch (error) {
        let errorMessage = `无法打开文件 "${file}"`;
        if (error.lineNumber && error.columnNumber) {
          errorMessage = `第${error.lineNumber}行第${error.columnNumber}列出错: ${errorMessage}`;
        }
        report.fail.push(`${file.replace('.sgmodule', '')}: ${errorMessage}`);
        console.error(`❌ 更新失败: ${file} - ${errorMessage}`);

        let alert = new Alert();
        alert.title = '⚠️ 警告';
        alert.message = errorMessage;
        alert.addAction('确定');
        await alert.presentAlert();
      }
    }
  }

  return report;
}

async function downloadContent(url) {
  const req = new Request(url);
  req.timeoutInterval = 10;
  req.method = 'GET';
  let content = await req.loadString();
  if (req.response.statusCode < 200 || req.response.statusCode >= 400) {
    throw new Error(`HTTP 状态码: ${req.response.statusCode}`);
  }
  if (!content) {
    throw new Error('未获取到模块内容');
  }
  return content;
}

function extractInfo(content, type) {
  const match = content.match(new RegExp(`^#!${type}\\s*=\\s*(.*?)\\s*(\n|$)`, 'im'));
  return match ? match[1] : '';
}

async function readFileContent(file, folderPath) {
  const fm = FileManager.iCloud();
  const filePath = `${folderPath}/${file}`;
  return fm.readString(filePath);
}

async function saveFileContent(file, folderPath, content) {
  if (folderPath) {
    const fm = FileManager.iCloud();
    const filePath = `${folderPath}/${file}`;
    fm.writeString(filePath, content);
  } else {
    await DocumentPicker.exportString(content, file);
  }
}

async function update() {
  const fm = FileManager.iCloud();
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
      idx = await alert.presentAlert();
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

function displayReport(report) {
  let alert = new Alert();
  let messageLines = [];

  // 显示更新成功的数量（如果不为0）
  if (report.success > 0) {
    messageLines.push(`✅ 模块更新成功: ${report.success}`);
  }

  // 显示更新失败的数量
  let failCount = report.fail.length + report.noUrl.length;
  if (failCount > 0) {
    messageLines.push(`❌ 模块更新失败: ${failCount}`);
  }

  // 显示分类更新情况
  let categoryLines = [];
  for (let category in report.categories) {
    if (report.categories[category] > 0) {
      categoryLines.push(`${category}: ${report.categories[category]}`);
    }
  }
  if (categoryLines.length > 0) {
    messageLines.push("模块分类统计:\n" + categoryLines.join('\n'));
  }

  // 显示更新失败的详细信息
  if (report.fail.length > 0) {
    messageLines.push("更新失败的模块:\n" + report.fail.join('\n'));
  }
  if (report.noUrl.length > 0) {
    messageLines.push("缺少订阅链接的模块:\n" + report.noUrl.map(file => `${file}: ⚠️模块内无链接`).join('\n'));
  }

  alert.title = `📦 模块总数: ${report.success + failCount}`;
  alert.message = messageLines.join('\n\n');

  alert.addDestructiveAction('重载 Surge');
  alert.addAction('打开 Surge');
  alert.addCancelAction('关闭');
  alert.presentAlert().then(async (choice) => {
    if (choice == 0) {
      const req = new Request('http://script.hub/reload');
      req.timeoutInterval = 10;
      req.method = 'GET';
      try {
        let res = await req.loadString();
        console.log('Surge 重载成功');
      } catch (error) {
        console.error('Surge 重载失败:', error);
        let alert = new Alert();
        alert.title = '⚠️ 警告';
        alert.message = '重载 Surge 失败，请手动重载。';
        alert.addAction('确定');
        await alert.presentAlert();
      }
    } else if (choice == 1) {
      Safari.open('surge://');
    }
  });
}

// 主脚本逻辑
async function main() {
  let idx;
  let fromUrlScheme;
  let checkUpdate;
  let cancelled = false;

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

    if (idx === -1) {
      cancelled = true;
    }
  }

  if (!cancelled) {
    let folderPath;
    let files = [];
    let contents = [];
    const fm = FileManager.iCloud();

if (idx == 3) { // 更新全部模块
      try {
        folderPath = await DocumentPicker.openFolder();
        files = fm.listContents(folderPath);
        let report = await updateModules(files, folderPath, [], true); // 传入true表示批量更新
        if (report) {
          displayReport(report);
        }
      } catch (error) {
        let alert = new Alert();
        alert.title = '⚠️ 警告';
        alert.message = '批量处理：请勿选择单个文件';
        alert.addAction('确定');
        await alert.presentAlert();
        return;
      }
    } else if (idx == 2) { // 更新单个模块
      try {
        const filePath = await DocumentPicker.openFile();
        folderPath = filePath.substring(0, filePath.lastIndexOf('/'));
        files = [filePath.substring(filePath.lastIndexOf('/') + 1)];
        let report = await updateModules(files, folderPath, [], false); // 传入false表示单个更新
        if (report) {
          displayReport(report);
        }
      } catch (error) {
        let alert = new Alert();
        alert.title = '⚠️ 警告';
        alert.message = '错误: 取消选择文档。';
        alert.addAction('确定');
        await alert.presentAlert();
        return;
      }
    } else if (idx == 1) { // 从链接创建
      let url;
      let name;
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
        let response = await alert.presentAlert();
        
        if (response === -1) {
          cancelled = true;
        } else {
          url = alert.textFieldValue(0);
          name = alert.textFieldValue(1);
        }
      }
      
      if (!cancelled && url) {
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
        files = [`${name}.sgmodule`];
        contents = [`#SUBSCRIBED ${url}`];
        let report = await updateModules(files, null, contents, false); // 传入false表示单个创建
        if (report) {
          displayReport(report);
        }
      }
    } else if (idx == 0) { // 更新本脚本
      console.log('检查更新');
      checkUpdate = true;
      await update();
    }
  }
}

// 运行主函数
await main();
