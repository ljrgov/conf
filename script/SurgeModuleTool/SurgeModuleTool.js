// prettier-ignore
let ToolVersion = "3.0.9";

async function delay(milliseconds) {
  return new Promise(resolve => {
    const start = Date.now();
    while (Date.now() - start < milliseconds) {
      // 空循环，直到时间过去
    }
    resolve();
  });
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
    const newText = text.slice(0, insertIndex) + addition + text.slice(insertIndex);
    return newText;
  }

  return text;
}

let idx;
let fromUrlScheme;
let checkUpdate;

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
}

let folderPath;
let files = [];
let contents = [];
const fm = FileManager.iCloud();

if (idx == 3) {
  folderPath = await DocumentPicker.openFolder();
  files = fm.listContents(folderPath);
} else if (idx == 2) {
  const filePath = await DocumentPicker.openFile();
  folderPath = filePath.substring(0, filePath.lastIndexOf('/'));
  files = [filePath.substring(filePath.lastIndexOf('/') + 1)];
} else if (idx == 1) {
  let url;
  let name;
  if (fromUrlScheme) {
    url = args.queryParameters.url;
    name = args.queryParameters.name;
  } else {
    alert = new Alert();
    alert.title = '将自动添加后缀 .sgmodule';
    alert.addTextField('链接(必填)', '');
    alert.addTextField('名称(选填)', '');
    alert.addAction('下载');
    alert.addCancelAction('取消');
    await alert.presentAlert();
    url = alert.textFieldValue(0);
    name = alert.textFieldValue(1);
  }
  if (url) {
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
  }
} else if (idx == 0) {
  console.log('检查更新');
  checkUpdate = true;
  await update();
}

let report = {
  success: 0,
  fail: [],
  noUrl: 0,
};

let categoryChangeInfo = ''; // 用于跟踪分类变更信息
let categoryChangedCount = 0; // 记录分类变更的次数

let categoryAlert = new Alert();
categoryAlert.title = '选择模块分类';
categoryAlert.addAction('去广告');
categoryAlert.addAction('功能模块');
categoryAlert.addAction('面板模块');
categoryAlert.addCancelAction('取消');
let categoryIdx = await categoryAlert.presentAlert();

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

let initialAlert = new Alert();
initialAlert.title = '处理中...';
initialAlert.message = '请稍等，正在处理文件。';
initialAlert.addCancelAction('取消');

let isCancelled = false;

let processingPromise = new Promise(async (resolve) => {
  let alertPromise = new Promise((alertResolve) => {
    initialAlert.presentAlert().then(() => {
      isCancelled = true;
      alertResolve();
    });
  });

  async function processFiles() {
    for await (const [index, file] of files.entries()) {
      if (isCancelled) {
        console.log('操作已取消');
        break;
      }

      if (file && !/\.(conf|txt|js|list)$/i.test(file)) {
        let originalCategory;
        let noUrl;
        let originalName, originalDesc;
        try {
          let content;
          let filePath;

          if (contents.length > 0) {
            content = contents[index];
          } else {
            filePath = `${folderPath}/${file}`;
            content = fm.readString(filePath);
          }

          const originalNameMatched = `${content}`.match(/^#\!name\s*?=\s*(.*?)\s*(\n|$)/im);
          if (originalNameMatched) originalName = originalNameMatched[1];

          const originalDescMatched = `${content}`.match(/^#\!desc\s*?=\s*(.*?)\s*(\n|$)/im);
          if (originalDescMatched) {
            originalDesc = originalDescMatched[1];
            if (originalDesc) originalDesc = originalDesc.replace(/^🔗.*?]\s*/i, '');
          }

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

          const req = new Request(url);
          req.timeoutInterval = 10;
          req.method = 'GET';
          let res = await req.loadString();
          const statusCode = req.response.statusCode;
          if (statusCode < 200 || statusCode >= 400) {
            throw new Error(`statusCode: ${statusCode}`);
          }

          const nameMatched = `${res}`.match(/^#\!name\s*?=\s*?\s*(.*?)\s*(\n|$)/im);
          if (!nameMatched) throw new Error('不是合法的模块内容');
          const name = nameMatched[1];
          if (!name) throw new Error('模块无名称字段');

          const descMatched = `${res}`.match(/^#\!desc\s*?=\s*?\s*(.*?)\s*(\n|$)/im);
          let desc;
          if (descMatched) desc = descMatched[1];
          if (!desc) res = `#!desc=\n${res}`;

          let categoryMatched = content.match(/^#\!category\s*?=\s*(.*?)\s*(\n|$)/im);
          originalCategory = categoryMatched ? categoryMatched[1] : '未分类';

          if (!categoryMatched) {
            content = `#!category=${selectedCategory}\n${content}`;
          } else if (selectedCategory !== originalCategory) {
            content = content.replace(/^#\!category\s*?=\s*(.*?)\s*(\n|$)/im, `#!category=${selectedCategory}\n`);
            categoryChangedCount++;
          }

          if (filePath) {
            fm.writeString(filePath, content);
          } else {
            await DocumentPicker.exportString(content, file);
          }

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
    resolve();
  }

  processFiles();
  alertPromise.then(() => {
    isCancelled = true;
  });
});

await processingPromise;

if (!isCancelled) {
  let resultAlert = new Alert();
  let upErrk = report.fail.length > 0 ? `❌ 更新失败: ${report.fail.length}` : '';
  let noUrlErrk = report.noUrl > 0 ? `🈚️ 无链接: ${report.noUrl}` : '';
  resultAlert.title = `📦 模块总数: ${report.success + report.fail.length + report.noUrl}`;
  resultAlert.message = `${noUrlErrk}\n✅ 更新成功: ${report.success}\n${categoryChangeInfo}\n${upErrk}${report.fail.length > 0 ? `\n${report.fail.join(', ')}` : ''}`;
  resultAlert.addDestructiveAction('重载 Surge');
  resultAlert.addAction('打开 Surge');
  resultAlert.addCancelAction('关闭');

  let idx = await resultAlert.presentAlert();
  if (idx === 0) {
    const req = new Request('http://script.hub/reload');
    req.timeoutInterval = 10;
    req.method = 'GET';
    await req.loadString();
  } else if (idx === 1) {
    Safari.open('surge://');
  }
}

async function update() {
  const fm = FileManager.iCloud();
  const dict = fm.documentsDirectory();
  const scriptName = 'SurgeModuleTool';
  let version;
  let resp;
  try {
    const url = `https://raw.githubusercontent.com/ljrgov/conf/main/script/SurgeModuleTool/SurgeModuleTool.js?v=${Date.now()}`;
    let req = new Request(url);
    req.method = 'GET';
    req.headers = {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    };
    resp = await req.loadString();
    const localPath = fm.joinPath(dict, `${scriptName}.js`);
    const currentVersion = fm.readString(localPath).match(/ToolVersion\s*=\s*"([^"]+)"/)[1];
    if (ToolVersion !== currentVersion) {
      fm.writeString(localPath, resp);
      console.log('脚本已更新');
    } else {
      console.log('脚本已是最新版本');
    }
  } catch (e) {
    console.error('更新脚本失败', e);
  }
}


