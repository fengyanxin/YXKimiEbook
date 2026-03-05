const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);
const app = express();
const PORT = 3001;

// 启用CORS
app.use(cors());
app.use(express.json());

// 确保上传目录存在
const uploadDir = path.join(__dirname, '../uploads');
const extractDir = path.join(__dirname, '../extracted');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(extractDir)) fs.mkdirSync(extractDir, { recursive: true });

// 配置multer存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB限制
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.epub', '.pdf', '.mobi', '.azw', '.azw3', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件格式'));
    }
  }
});

// 解析EPUB文件
async function parseEpub(filePath) {
  const JSZip = require('jszip');
  const xml2js = require('xml2js');
  
  try {
    const data = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(data);
    
    // 读取container.xml找到OPF文件路径
    const containerData = await zip.file('META-INF/container.xml').async('text');
    const parser = new xml2js.Parser();
    const container = await parser.parseStringPromise(containerData);
    const opfPath = container.container.rootfiles[0].rootfile[0].$['full-path'];
    const basePath = path.dirname(opfPath);
    
    // 读取OPF文件
    const opfData = await zip.file(opfPath).async('text');
    const opf = await parser.parseStringPromise(opfData);
    
    const metadata = opf.package.metadata[0];
    const manifest = opf.package.manifest[0];
    const spine = opf.package.spine[0];
    
    const title = metadata['dc:title']?.[0] || '未知标题';
    const author = metadata['dc:creator']?.[0]?._ || metadata['dc:creator']?.[0] || '未知作者';
    
    // 获取章节列表
    const chapters = [];
    const manifestItems = {};
    
    manifest.item.forEach(item => {
      manifestItems[item.$.id] = item.$;
    });
    
    if (spine.itemref) {
      for (let i = 0; i < spine.itemref.length; i++) {
        const idref = spine.itemref[i].$.idref;
        const item = manifestItems[idref];
        if (item) {
          const chapterPath = basePath ? `${basePath}/${item.href}` : item.href;
          try {
            const chapterFile = zip.file(chapterPath);
            if (chapterFile) {
              const content = await chapterFile.async('text');;
              chapters.push({
                id: i,
                title: `章节 ${i + 1}`,
                content: content
              });
            }
          } catch (e) {
            console.error('读取章节失败:', e);
          }
        }
      }
    }
    
    return {
      title,
      author,
      format: 'epub',
      chapters,
      totalChapters: chapters.length
    };
  } catch (error) {
    throw new Error('EPUB解析失败: ' + error.message);
  }
}

// 解析TXT文件
async function parseTxt(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const title = lines[0]?.trim() || '未知标题';
    const author = lines[1]?.includes('作者') ? lines[1].replace(/作者[:：]/, '').trim() : '未知作者';
    
    // 将内容分成章节
    const chapters = [];
    const chapterRegex = /^(第[一二三四五六七八九十百千万\d]+章|Chapter\s+\d+|\d+\.|【.+?】)/i;
    let currentChapter = { id: 0, title: '前言', content: '' };
    
    lines.forEach((line, index) => {
      if (chapterRegex.test(line.trim())) {
        if (currentChapter.content) {
          chapters.push(currentChapter);
        }
        currentChapter = {
          id: chapters.length,
          title: line.trim(),
          content: ''
        };
      } else {
        currentChapter.content += line + '\n';
      }
    });
    
    if (currentChapter.content) {
      chapters.push(currentChapter);
    }
    
    // 如果没有检测到章节，将整个文件作为一个章节
    if (chapters.length === 0) {
      chapters.push({
        id: 0,
        title: '全文',
        content: content
      });
    }
    
    return {
      title,
      author,
      format: 'txt',
      chapters,
      totalChapters: chapters.length
    };
  } catch (error) {
    throw new Error('TXT解析失败: ' + error.message);
  }
}

// 解析PDF文件
async function parsePdf(filePath) {
  try {
    const pdfjsLib = require('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = '';
    
    const data = new Uint8Array(fs.readFileSync(filePath));
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    
    const chapters = [];
    for (let i = 1; i <= Math.min(pdf.numPages, 50); i++) { // 限制前50页
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const text = textContent.items.map(item => item.str).join(' ');
      
      chapters.push({
        id: i - 1,
        title: `第 ${i} 页`,
        content: `<div style="padding: 20px;">${text}</div>`
      });
    }
    
    return {
      title: path.basename(filePath, '.pdf'),
      author: '未知作者',
      format: 'pdf',
      chapters,
      totalChapters: pdf.numPages
    };
  } catch (error) {
    throw new Error('PDF解析失败: ' + error.message);
  }
}

// 解析MOBI/AZW文件
async function parseMobi(filePath) {
  // MOBI格式复杂，这里返回基本信息，实际内容需要专用工具解析
  const fileName = path.basename(filePath);
  return {
    title: fileName.replace(/\.\w+$/, ''),
    author: '未知作者',
    format: 'mobi',
    chapters: [{
      id: 0,
      title: '全文',
      content: '<p>MOBI/AZW格式需要转换为EPUB后阅读</p><p>请使用Calibre等工具转换后重新上传</p>'
    }],
    totalChapters: 1,
    needsConversion: true
  };
}

// 文件上传接口
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '没有上传文件' });
    }
    
    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();
    
    let bookData;
    
    switch (ext) {
      case '.epub':
        bookData = await parseEpub(filePath);
        break;
      case '.txt':
        bookData = await parseTxt(filePath);
        break;
      case '.pdf':
        bookData = await parsePdf(filePath);
        break;
      case '.mobi':
      case '.azw':
      case '.azw3':
        bookData = await parseMobi(filePath);
        break;
      default:
        return res.status(400).json({ error: '不支持的文件格式' });
    }
    
    // 保存解析后的数据
    const bookId = path.basename(req.file.filename, ext);
    const dataPath = path.join(extractDir, `${bookId}.json`);
    fs.writeFileSync(dataPath, JSON.stringify(bookData));
    
    res.json({
      success: true,
      bookId,
      ...bookData
    });
    
  } catch (error) {
    console.error('上传处理错误:', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取书籍内容接口
app.get('/api/book/:bookId', (req, res) => {
  try {
    const { bookId } = req.params;
    const dataPath = path.join(extractDir, `${bookId}.json`);
    
    if (!fs.existsSync(dataPath)) {
      return res.status(404).json({ error: '书籍不存在' });
    }
    
    const bookData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    res.json(bookData);
    
  } catch (error) {
    console.error('获取书籍错误:', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取章节内容接口
app.get('/api/book/:bookId/chapter/:chapterId', (req, res) => {
  try {
    const { bookId, chapterId } = req.params;
    const dataPath = path.join(extractDir, `${bookId}.json`);
    
    if (!fs.existsSync(dataPath)) {
      return res.status(404).json({ error: '书籍不存在' });
    }
    
    const bookData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    const chapter = bookData.chapters.find(c => c.id === parseInt(chapterId));
    
    if (!chapter) {
      return res.status(404).json({ error: '章节不存在' });
    }
    
    res.json(chapter);
    
  } catch (error) {
    console.error('获取章节错误:', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取书籍列表接口
app.get('/api/books', (req, res) => {
  try {
    const files = fs.readdirSync(extractDir);
    const books = files
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const data = JSON.parse(fs.readFileSync(path.join(extractDir, f), 'utf-8'));
        return {
          bookId: f.replace('.json', ''),
          title: data.title,
          author: data.author,
          format: data.format,
          totalChapters: data.totalChapters
        };
      });
    
    res.json(books);
    
  } catch (error) {
    console.error('获取书籍列表错误:', error);
    res.status(500).json({ error: error.message });
  }
});

// 删除书籍接口
app.delete('/api/book/:bookId', (req, res) => {
  try {
    const { bookId } = req.params;
    const dataPath = path.join(extractDir, `${bookId}.json`);
    
    // 删除JSON文件
    if (fs.existsSync(dataPath)) {
      fs.unlinkSync(dataPath);
    }
    
    // 删除上传的原始文件
    const files = fs.readdirSync(uploadDir);
    const originalFile = files.find(f => f.startsWith(bookId));
    if (originalFile) {
      fs.unlinkSync(path.join(uploadDir, originalFile));
    }
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('删除书籍错误:', error);
    res.status(500).json({ error: error.message });
  }
});

// 静态文件服务
app.use('/uploads', express.static(uploadDir));

app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});

module.exports = app;
