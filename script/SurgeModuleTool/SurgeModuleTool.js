// ... (前面的函数保持不变)

async function downloadContent(url) {
  try {
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
  } catch (error) {
    let alert = new Alert();
    alert.title = "警告";
    alert.message = "⚠️ 无效的URL";
    await alert.presentAlert();
    throw new Error('URL请求失败');
  }
}

async function chooseCategory(currentCategory, moduleName) {
  let alert = new Alert();
  alert.title = "选择模块分类";
  alert.message = `当前模块：${moduleName}\n当前分类：${currentCategory}`;
  alert.addAction("📙广告模块");
  alert.addAction("📘功能模块");
  alert.addAction("📗面板模块");
  alert.addAction("📚保持当前分类");
  let choice = await alert.presentAlert();
  const categories = ["📙广告模块", "📘功能模块", "📗面板模块", "📚保持当前分类"];
  return categories[choice];
}

async function updateModules(files, folderPath, contents = []) {
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

  for await (const [index, file] of files.entries()) {
    if (file && !/\.(conf|txt|js|list)$/i.test(file)) {
      try {
        // 读取文件内容
        let content = contents[index] || await readFileContent(file, folderPath);

        // 解析原始信息和订阅链接
        let originalCategory = extractInfo(content, 'category');
        let moduleName = extractInfo(content, 'name') || file.replace('.sgmodule', '');
        const subscribeMatch = content.match(/^#SUBSCRIBED\s+(.*?)\s*(\n|$)/im);
        if (!subscribeMatch) {
          report.noUrl.push(file);
          report.fail.push(`${file}: ⚠️模块内无链接`);
          continue;
        }
        const url = subscribeMatch[1];

        // 下载新内容
        let newContent;
        try {
          newContent = await downloadContent(url);
        } catch (error) {
          report.fail.push(`${file}: ${error.message}`);
          continue;
        }

        // 更新特定行
        let updatedContent = newContent;
        updatedContent = updatedContent.replace(/^#!desc=.*\n?/m, `#!desc=🔗 [${new Date().toLocaleString()}] ${extractInfo(newContent, 'desc') || ''}\n`);
        
        // 确保 category 在正确的位置
        updatedContent = updatedContent.replace(/^#!category=.*\n?/m, '');
        const categoryLine = `#!category=${originalCategory || "📚未分类"}\n`;
        
        // 查找最后一个以 #! 开头的行
        const lines = updatedContent.split('\n');
        let lastMetadataIndex = lines.reduce((lastIndex, line, index) => 
          line.startsWith('#!') ? index : lastIndex, -1);

        // 插入 category 行
        if (lastMetadataIndex !== -1) {
          lines.splice(lastMetadataIndex + 1, 0, categoryLine);
        } else {
          lines.unshift(categoryLine);
        }

        // 插入 SUBSCRIBED 行
        lines.splice(lastMetadataIndex + 2, 0, '', '# 🔗 模块链接', `#SUBSCRIBED ${url}`);

        updatedContent = lines.join('\n');

        // 保存更新后的内容
        let savePath = await DocumentPicker.exportString(updatedContent, file);
        folderPath = savePath.substring(0, savePath.lastIndexOf('/'));

        // 重新分类
        let updatedCategory = await chooseCategory(originalCategory || "📚未分类", moduleName);
        if (updatedCategory !== "📚保持当前分类") {
          updatedContent = updatedContent.replace(/^#!category=.*$/m, `#!category=${updatedCategory}`);
          await saveFileContent(file, folderPath, updatedContent);
          report.categories[updatedCategory]++;
        } else {
          report.categories[originalCategory || "📚未分类"]++;
        }

        console.log(`✅ 更新成功: ${file}`);
        report.success += 1;

      } catch (error) {
        report.fail.push(`${file}: ${error.message}`);
        console.error(`❌ 更新失败: ${file} - ${error.message}`);
      }
    }
  }

  return report;
}

// 主脚本逻辑
let idx;
let fromUrlScheme;
let checkUpdate;
let cancelled = false;

// ... (中间的代码保持不变)

if (!cancelled && !checkUpdate) {
  let report = await updateModules(files, folderPath, contents);

  if (!fromUrlScheme) {
    let alert = new Alert();
    let messageLines = [];

    // 显示更新成功的数量
    messageLines.push(`✅ 更新成功: ${report.success}`);

    // 显示更新失败的数量和模块
    let totalFail = report.fail.length;
    if (totalFail > 0) {
      messageLines.push(`❌ 更新失败: ${totalFail}`);
    }

    // 显示分类更新情况
    for (let category in report.categories) {
      if (report.categories[category] > 0) {
        messageLines.push(`${category}：${report.categories[category]}`);
      }
    }

    // 显示无链接的模块
    if (report.noUrl.length > 0) {
      messageLines.push('');
      messageLines.push('⚠️模块内无链接:');
      messageLines.push(report.noUrl.map(file => file.replace('.sgmodule', '')).join('\n'));
    }

    alert.title = `📦 模块总数: ${report.success + totalFail}`;
    alert.message = messageLines.join('\n');

    alert.addDestructiveAction('重载 Surge');
    alert.addAction('打开 Surge');
    alert.addCancelAction('关闭');
    let choice = await alert.presentAlert();
    if (choice == 0) {
      const req = new Request('http://script.hub/reload');
      req.timeoutInterval = 10;
      req.method = 'GET';
      let res = await req.loadString();
    } else if (choice == 1) {
      Safari.open('surge://');
    }
  }
}
