// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: cloud-download-alt;

// prettier-ignore
let ToolVersion = "2.2";

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

async function selectCategory() {
  let alert = new Alert()
  alert.title = '选择模块分类'
  alert.addAction('功能模块')
  alert.addAction('去广告')
  alert.addAction('面板模块')
  alert.addCancelAction('取消')
  let idx = await alert.presentAlert()
  switch (idx) {
    case 0: return '功能模块'
    case 1: return '去广告'
    case 2: return '面板模块'
    default: return ''
  }
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

for await (const [index, file] of files.entries()) {
  if (file && !/\.(conf|txt|js|list)$/i.test(file)) {
    // console.log(file);
    let originalName
    let originalDesc
    let noUrl
    try {
      let content
      let filePath
      if (contents.length > 0) {
        content = contents[index]
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
      const descMatched = `${res}`.match(/^#\!desc\s*?=\s*?\s*(.*?)\s*(\n|$)/im)
      let desc
      if (descMatched) {
        desc = descMatched[1]
      }
      if (!desc) {
        res = `#!desc=\n${res}`
      }
      res = res.replace(/^(#SUBSCRIBED|# 🔗 模块链接)(.*?)(\n|$)/gim, '')
      // console.log(res);
      res = addLineAfterLastOccurrence(res, `\n\n# 🔗 模块链接\n${subscribed.replace(/\n/g, '')}\n`)

      // Prompt for category selection
      let category = await selectCategory()
      if (category) {
        res = addLineAfterLastOccurrence(res, `\n\n#!category=${category}\n`)
      }

      content = `${res}`.replace(/^#\!desc\s*?=\s*/im, `#!desc=🔗 [${new Date().toLocaleString()}] `)
      // console.log(content);
      if (filePath) {
        fm.writeString(filePath, content)
      } else {
        await DocumentPicker.exportString(content, file)
      }

      // }
      let nameInfo = `${name}`
      let descInfo = `${desc}`
      if (originalName && name !== originalName) {
        nameInfo = `${originalName} -> ${name}`
      }
      if (originalDesc && desc !== originalDesc) {
        descInfo = `${originalDesc} -> ${desc}`
      }
      console.log(`\n✅ ${nameInfo}\n${descInfo}\n\n`)
      report.success++
    } catch (error) {
      if (noUrl) {
        console.log(`❌ 无订阅链接 ${file}\n${error.message}\n\n`)
        report.noUrl++
      } else {
        console.log(`❌ ${file}\n${error.message}\n\n`)
        report.fail.push(file)
      }
    }
  }
}

if (checkUpdate) {
  await update()
}

let result = '更新结果\n'
result += `成功: ${report.success} 个\n`
result += `失败: ${report.fail.length} 个\n`
result += `无链接: ${report.noUrl} 个\n`
if (report.fail.length > 0) {
  result += `\n失败的文件:\n${report.fail.join('\n')}\n`
}

let alert = new Alert()
alert.title = '更新完成'
alert.message = result
alert.addAction('完成')
await alert.presentAlert()

async function update() {
  const req = new Request('https://raw.githubusercontent.com/ljrgov/conf/main/script/SurgeModuleTool/SurgeModuleTool.js')
  req.timeoutInterval = 5
  req.method = 'GET'
  let res = await req.loadString()
  if (res) {
    try {
      const json = JSON.parse(res)
      if (json && json.version && json.version > ToolVersion) {
        const updateUrl = json.url
        if (updateUrl) {
          const updateRequest = new Request(updateUrl)
          updateRequest.timeoutInterval = 10
          updateRequest.method = 'GET'
          let updateContent = await updateRequest.loadString()
          if (updateContent) {
            const updateFilePath = `${fm.documentsDirectory()}/SurgeModuleTool.js`
            fm.writeString(updateFilePath, updateContent)
            const alert = new Alert()
            alert.title = '更新完成'
            alert.message = `请重新启动脚本以应用新版本。`
            alert.addAction('完成')
            await alert.presentAlert()
          }
        }
      } else {
        const alert = new Alert()
        alert.title = '无更新'
        alert.message = '当前已经是最新版本。'
        alert.addAction('完成')
        await alert.presentAlert()
      }
    } catch (e) {
      console.error(e)
    }
  }
}


