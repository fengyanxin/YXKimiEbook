import JSZip from 'jszip';
import type { Book, Chapter } from '@/types/ebook';

// 解析EPUB文件
export async function parseEpub(file: File, _onProgress?: (progress: number) => void): Promise<Book> {
  console.log('[EPUB] 开始解析文件:', file.name);
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  
  // 读取container.xml找到OPF文件路径
  const containerFile = zip.file('META-INF/container.xml');
  if (!containerFile) {
    throw new Error('无效的EPUB文件：缺少container.xml');
  }
  
  const containerData = await containerFile.async('text');
  const parser = new DOMParser();
  const containerDoc = parser.parseFromString(containerData, 'application/xml');
  const rootfile = containerDoc.querySelector('rootfile');
  
  if (!rootfile) {
    throw new Error('无效的EPUB文件：无法找到rootfile');
  }
  
  const opfPath = rootfile.getAttribute('full-path');
  if (!opfPath) {
    throw new Error('无效的EPUB文件：无法找到OPF路径');
  }
  
  const basePath = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';
  
  // 读取OPF文件
  const opfFile = zip.file(opfPath);
  if (!opfFile) {
    throw new Error('无效的EPUB文件：无法找到OPF文件');
  }
  
  const opfData = await opfFile.async('text');
  const opfDoc = parser.parseFromString(opfData, 'application/xml');
  
  // 提取元数据
  const titleEl = opfDoc.querySelector('metadata > dc\\:title, metadata > title');
  const creatorEl = opfDoc.querySelector('metadata > dc\\:creator, metadata > creator');
  
  const title = titleEl?.textContent || '未知标题';
  const author = creatorEl?.textContent || '未知作者';
  
  // 解析manifest
  const manifestItems: Record<string, { href: string; mediaType: string; id: string }> = {};
  const manifest = opfDoc.querySelector('manifest');
  if (manifest) {
    manifest.querySelectorAll('item').forEach(item => {
      const id = item.getAttribute('id');
      const href = item.getAttribute('href');
      const mediaType = item.getAttribute('media-type');
      if (id && href) {
        manifestItems[id] = { id, href, mediaType: mediaType || '' };
      }
    });
  }
  
  // 提取封面
  let cover: string | undefined;
  
  // 方法1: 查找meta name="cover"
  const coverMeta = opfDoc.querySelector('metadata meta[name="cover"]');
  if (coverMeta) {
    const coverId = coverMeta.getAttribute('content');
    if (coverId && manifestItems[coverId]) {
      const coverHref = manifestItems[coverId].href;
      const coverPath = basePath + coverHref;
      const coverFile = zip.file(coverPath);
      if (coverFile) {
        const coverData = await coverFile.async('base64');
        const mediaType = manifestItems[coverId].mediaType || 'image/jpeg';
        cover = `data:${mediaType};base64,${coverData}`;
      }
    }
  }
  
  // 方法2: 查找id包含cover的item
  if (!cover) {
    for (const [id, item] of Object.entries(manifestItems)) {
      if (id.toLowerCase().includes('cover') && item.mediaType?.startsWith('image/')) {
        const coverPath = basePath + item.href;
        const coverFile = zip.file(coverPath);
        if (coverFile) {
          const coverData = await coverFile.async('base64');
          cover = `data:${item.mediaType};base64,${coverData}`;
          break;
        }
      }
    }
  }
  
  // 方法3: 查找第一个图片作为封面
  if (!cover) {
    for (const item of Object.values(manifestItems)) {
      if (item.mediaType?.startsWith('image/')) {
        const imgPath = basePath + item.href;
        const imgFile = zip.file(imgPath);
        if (imgFile) {
          const imgData = await imgFile.async('base64');
          cover = `data:${item.mediaType};base64,${imgData}`;
          break;
        }
      }
    }
  }
  
  // 收集所有图片资源 - 使用多种路径格式作为key
  const imageMap: Record<string, string> = {};
  for (const item of Object.values(manifestItems)) {
    if (item.mediaType?.startsWith('image/')) {
      const imgPath = basePath + item.href;
      const imgFile = zip.file(imgPath);
      if (imgFile) {
        const imgData = await imgFile.async('base64');
        const dataUrl = `data:${item.mediaType};base64,${imgData}`;
        
        // 存储多种路径格式
        imageMap[item.href] = dataUrl;
        imageMap[basePath + item.href] = dataUrl;
        
        // 文件名
        const fileName = item.href.split('/').pop();
        if (fileName) {
          imageMap[fileName] = dataUrl;
        }
        
        // 处理相对路径的各种变体
        const pathParts = item.href.split('/');
        if (pathParts.length > 1) {
          // 存储去掉一级目录的路径
          const withoutFirstDir = pathParts.slice(1).join('/');
          imageMap[withoutFirstDir] = dataUrl;
          imageMap['../' + withoutFirstDir] = dataUrl;
          imageMap['./' + withoutFirstDir] = dataUrl;
        }
        
        // 存储纯文件名（去掉扩展名）用于模糊匹配
        const nameWithoutExt = fileName?.replace(/\.[^.]+$/, '');
        if (nameWithoutExt) {
          imageMap[nameWithoutExt] = dataUrl;
        }
      }
    }
  }
  
  // 解析spine获取阅读顺序
  const chapters: Chapter[] = [];
  const spine = opfDoc.querySelector('spine');
  if (spine) {
    const itemrefs = spine.querySelectorAll('itemref');
    let chapterIndex = 0;
    
    for (const itemref of itemrefs) {
      const idref = itemref.getAttribute('idref');
      if (idref && manifestItems[idref]) {
        const { href } = manifestItems[idref];
        const chapterPath = basePath + href;
        const chapterFile = zip.file(chapterPath);
        
        if (chapterFile) {
          let content = await chapterFile.async('text');
          
          // 获取当前章节所在目录
          const chapterDir = href.includes('/') ? href.substring(0, href.lastIndexOf('/') + 1) : '';
          
          // 处理内容中的图片路径
          content = processContentImages(content, imageMap, basePath, chapterDir);
          
          // 使用正则提取body内容
          const bodyMatch = content.match(/<body[^>]*>([\s\S]*)<\/body>/i);
          const bodyContent = bodyMatch ? bodyMatch[1] : content;
          
          // 提取章节标题
          const titleMatch = content.match(/<h1[^>]*>([^<]*)<\/h1>/i) || 
                            content.match(/<h2[^>]*>([^<]*)<\/h2>/i) ||
                            content.match(/<title[^>]*>([^<]*)<\/title>/i);
          const chapterTitle = titleMatch?.[1]?.trim() || `章节 ${chapterIndex + 1}`;
          
          chapters.push({
            id: chapterIndex,
            title: chapterTitle,
            content: bodyContent,
          });
          
          chapterIndex++;
        }
      }
    }
  }
  
  if (chapters.length === 0) {
    throw new Error('无法提取章节内容');
  }
  
  return {
    id: generateBookId(),
    title,
    author,
    format: 'epub',
    cover,
    chapters,
    totalChapters: chapters.length,
    currentChapter: 0,
    currentPage: 0,
    addedAt: Date.now(),
  };
}

// 处理内容中的图片路径
function processContentImages(
  content: string, 
  imageMap: Record<string, string>, 
  basePath: string,
  chapterDir: string
): string {
  // 处理 img 标签的 src 属性
  content = content.replace(
    /<img([^>]+)src=["']([^"']+)["']([^>]*)>/gi,
    (match, beforeSrc, src, afterSrc) => {
      const dataUrl = findImageDataUrl(src, imageMap, basePath, chapterDir);
      if (dataUrl) {
        return `<img${beforeSrc}src="${dataUrl}"${afterSrc}>`;
      }
      return match;
    }
  );
  
  // 处理 srcset 属性
  content = content.replace(
    /srcset=["']([^"']+)["']/gi,
    (_match, srcset) => {
      const urls = srcset.split(',').map((part: string) => {
        const [url, descriptor] = part.trim().split(/\s+/);
        const dataUrl = findImageDataUrl(url, imageMap, basePath, chapterDir);
        return dataUrl ? `${dataUrl} ${descriptor || ''}`.trim() : part;
      });
      return `srcset="${urls.join(', ')}"`;
    }
  );
  
  // 处理 background-image 样式
  content = content.replace(
    /background-image:\s*url\(["']?([^"')]+)["']?\)/gi,
    (_match, url) => {
      const dataUrl = findImageDataUrl(url, imageMap, basePath, chapterDir);
      if (dataUrl) {
        return `background-image: url(${dataUrl})`;
      }
      return _match;
    }
  );
  
  // 处理 xlink:href (SVG中的图片)
  content = content.replace(
    /xlink:href=["']([^"']+)["']/gi,
    (_match, href) => {
      if (href.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
        const dataUrl = findImageDataUrl(href, imageMap, basePath, chapterDir);
        if (dataUrl) {
          return `xlink:href="${dataUrl}"`;
        }
      }
      return _match;
    }
  );
  
  return content;
}

// 查找图片的 Data URL
function findImageDataUrl(
  src: string, 
  imageMap: Record<string, string>, 
  basePath: string,
  chapterDir: string
): string | null {
  if (!src || src.startsWith('data:') || src.startsWith('http')) {
    return null;
  }
  
  // 尝试直接匹配
  if (imageMap[src]) {
    return imageMap[src];
  }
  
  // 解码 URL 编码的路径
  const decodedSrc = decodeURIComponent(src);
  if (imageMap[decodedSrc]) {
    return imageMap[decodedSrc];
  }
  
  // 获取文件名
  const fileName = src.split('/').pop();
  if (fileName && imageMap[fileName]) {
    return imageMap[fileName];
  }
  
  // 处理相对路径 ../
  if (src.startsWith('../')) {
    const withoutParent = src.replace(/\.\.\//g, '');
    if (imageMap[withoutParent]) {
      return imageMap[withoutParent];
    }
    
    // 尝试在 basePath 下查找
    const withBasePath = basePath + withoutParent;
    if (imageMap[withBasePath]) {
      return imageMap[withBasePath];
    }
  }
  
  // 处理相对路径 ./
  if (src.startsWith('./')) {
    const withoutCurrent = src.substring(2);
    const chapterRelative = chapterDir + withoutCurrent;
    if (imageMap[chapterRelative]) {
      return imageMap[chapterRelative];
    }
    if (imageMap[withoutCurrent]) {
      return imageMap[withoutCurrent];
    }
  }
  
  // 尝试添加 chapterDir 前缀
  if (chapterDir) {
    const withChapterDir = chapterDir + src;
    if (imageMap[withChapterDir]) {
      return imageMap[withChapterDir];
    }
    
    // 处理 ../ 在 chapterDir 上下文中的情况
    if (src.startsWith('../')) {
      const parentDir = chapterDir.split('/').slice(0, -2).join('/') + '/';
      const resolvedPath = parentDir + src.replace('../', '');
      if (imageMap[resolvedPath]) {
        return imageMap[resolvedPath];
      }
    }
  }
  
  // 尝试添加 basePath 前缀
  if (basePath) {
    const withBasePath = basePath + src;
    if (imageMap[withBasePath]) {
      return imageMap[withBasePath];
    }
    
    // 处理 ../ 在 basePath 上下文中的情况
    if (src.startsWith('../')) {
      const parentBasePath = basePath.split('/').slice(0, -2).join('/') + '/';
      const resolvedPath = parentBasePath + src.replace('../', '');
      if (imageMap[resolvedPath]) {
        return imageMap[resolvedPath];
      }
    }
  }
  
  // 尝试去掉路径只匹配文件名
  if (fileName) {
    const nameWithoutExt = fileName.replace(/\.[^.]+$/, '');
    if (imageMap[nameWithoutExt]) {
      return imageMap[nameWithoutExt];
    }
  }
  
  return null;
}

// 解析TXT文件
export async function parseTxt(file: File, onProgress?: (progress: number) => void): Promise<Book> {
  console.log('[TXT] 开始解析文件:', file.name);
  onProgress?.(10);

  // 读取文件为 ArrayBuffer 以便尝试不同编码
  const arrayBuffer = await file.arrayBuffer();
  console.log('[TXT] 文件大小:', arrayBuffer.byteLength, 'bytes');

  // 尝试多种编码解码
  const encodings = ['utf-8', 'gbk', 'gb2312', 'big5', 'utf-16le', 'utf-16be'];
  let text = '';
  let usedEncoding = '';

  for (const encoding of encodings) {
    try {
      const decoder = new TextDecoder(encoding, { fatal: true });
      const decoded = decoder.decode(arrayBuffer);

      // 检查解码结果是否合理（包含中文字符或普通文本）
      if (decoded.length > 0 && isDecodedTextValid(decoded)) {
        text = decoded;
        usedEncoding = encoding;
        console.log('[TXT] 使用编码:', encoding);
        break;
      }
    } catch (e) {
      // 该编码无法解码，尝试下一个
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.log('[TXT] 编码', encoding, '尝试失败:', errorMsg);
    }
  }

  // 如果所有编码都失败，尝试非严格模式
  if (!text) {
    try {
      const decoder = new TextDecoder('gbk', { fatal: false });
      text = decoder.decode(arrayBuffer);
      usedEncoding = 'gbk (fallback)';
      console.log('[TXT] 使用 GBK fallback 解码');
    } catch (e) {
      console.error('[TXT] 所有编码尝试失败:', e);
      throw new Error('无法解析 TXT 文件，可能使用了不支持的编码');
    }
  }

  onProgress?.(30);

  const lines = text.split(/\r?\n/);
  console.log('[TXT] 行数:', lines.length, '编码:', usedEncoding);

  // 尝试提取标题（第一行）
  let title = lines[0]?.trim() || file.name.replace('.txt', '');
  if (title.length > 50) title = title.substring(0, 50);

  // 尝试提取作者（第二行可能包含作者信息）
  let author = '未知作者';
  if (lines[1] && (lines[1].includes('作者') || lines[1].includes('Author'))) {
    author = lines[1].replace(/作者[:：\s]*|Author[:：\s]*/i, '').trim();
  }

  // 更丰富的章节识别正则
  const chapterRegex = /^(第[一二三四五六七八九十百千万\d]+[章节卷]|Chapter\s+\d+|\d+[\.、]\s*|【.+?】|\[.+?\]|—.+?—|第\d+章)/i;

  const chapters: Chapter[] = [];
  let currentChapter: Chapter = {
    id: 0,
    title: '前言',
    content: '',
  };

  const totalLines = lines.length;
  let processedLines = 0;

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (chapterRegex.test(trimmedLine)) {
      // 保存前一个章节
      if (currentChapter.content.trim()) {
        chapters.push(currentChapter);
      }

      // 创建新章节
      currentChapter = {
        id: chapters.length,
        title: trimmedLine,
        content: '',
      };

      // 更新进度
      if (chapters.length % 10 === 0 || chapters.length === 0) {
        onProgress?.(30 + Math.min((processedLines / totalLines) * 60, 60));
      }
    } else {
      currentChapter.content += line + '\n';
    }

    processedLines++;
  }

  // 添加最后一个章节
  if (currentChapter.content.trim()) {
    chapters.push(currentChapter);
  }

  // 如果没有检测到章节，将整个文件作为一个章节
  if (chapters.length === 0) {
    chapters.push({
      id: 0,
      title: '全文',
      content: text,
    });
  }

  // 如果只有一个章节且标题是"前言"，更新为更合适的标题
  if (chapters.length === 1 && chapters[0].title === '前言') {
    chapters[0].title = title;
  }

  onProgress?.(90);

  // 将纯文本转换为HTML
  chapters.forEach((chapter, _index) => {
    // 处理段落（连续空行表示段落）
    const paragraphs = chapter.content.split(/\n{2,}/);
    const htmlContent = paragraphs.map(p => {
      const trimmed = p.trim();
      return trimmed ? `<p style="text-indent: 2em; margin-bottom: 1em;">${escapeHtml(trimmed).replace(/\n/g, '<br/>')}</p>` : '';
    }).join('');

    chapter.content = `<div class="txt-content">${htmlContent}</div>`;
  });

  console.log('[TXT] 解析完成，共', chapters.length, '章');

  return {
    id: generateBookId(),
    title,
    author,
    format: 'txt',
    chapters,
    totalChapters: chapters.length,
    currentChapter: 0,
    currentPage: 0,
    addedAt: Date.now(),
  };
}

// 解析PDF文件
export async function parsePdf(file: File, onProgress?: (progress: number) => void): Promise<Book> {
  console.log('[PDF] 开始解析文件:', file.name);
  // 动态导入 pdfjs-dist
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  // 获取正确的 worker 路径 (使用 unpkg CDN，支持最新版本)
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  console.log('[PDF] Worker 路径已设置:', pdfjsLib.GlobalWorkerOptions.workerSrc);

  let pdf: any = null;

  try {
    onProgress?.(10);

    const arrayBuffer = await file.arrayBuffer();
    console.log('[PDF] 文件已读取，大小:', file.size, 'bytes');

    // 加载 PDF 文档
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    pdf = await loadingTask.promise;
    console.log('[PDF] PDF 文档已加载，总页数:', pdf.numPages);

    // 检查是否成功加载
    if (!pdf) {
      throw new Error('无法加载 PDF 文件');
    }

    onProgress?.(20);

    // 尝试提取封面（第一页作为封面）
    let cover: string | undefined;
    try {
      const firstPage = await pdf.getPage(1);
      const viewport = firstPage.getViewport({ scale: 0.5 });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (context) {
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await firstPage.render({ canvas, canvasContext: context, viewport }).promise;
        cover = canvas.toDataURL('image/jpeg', 0.7);
      }
      onProgress?.(30);
    } catch (e) {
      console.error('提取PDF封面失败:', e);
      // 封面提取失败不影响整体解析
    }

    const chapters: Chapter[] = [];
    // 限制最多50页以提高性能
    const totalPages = Math.min(pdf.numPages, 50);
    console.log('[PDF] 开始解析章节，将处理:', totalPages, '页');

    for (let i = 1; i <= totalPages; i++) {
      try {
        const page = await pdf.getPage(i);
        let text = '';

        // 尝试提取文本内容
        try {
          const textContent = await page.getTextContent();
          console.log(`[PDF] 第 ${i} 页 textContent:`, textContent);

          // PDF.js v5 使用 items 数组
          if (textContent.items && Array.isArray(textContent.items)) {
            // 处理每个文本项
            const textItems = textContent.items
              .filter((item: any) => item && item.str !== undefined)
              .map((item: any) => item.str || '');

            // 连接文本项，在项目之间添加适当的空格
            text = textItems.join('');

            // 尝试根据位置信息保留换行
            if (textContent.items.length > 0) {
              let y = -1;
              let formattedText = '';
              textContent.items.forEach((item: any) => {
                if (item.str) {
                  // 如果 y 坐标发生显著变化，添加换行
                  if (y !== -1 && Math.abs((item.transform[5] || 0) - y) > 10) {
                    formattedText += '\n';
                  }
                  formattedText += item.str;
                  y = item.transform[5] || 0;
                }
              });
              if (formattedText) {
                text = formattedText;
              }
            }
          } else if (textContent.textContent) {
            // 备用：直接使用 textContent 属性
            text = textContent.textContent || '';
          }

          console.log(`[PDF] 第 ${i} 页提取文本长度:`, text.length);
        } catch (textError) {
          console.error(`[PDF] 第 ${i} 页文本提取失败:`, textError);
          text = '';
        }

        // 如果没有文本，可能是图片型 PDF
        if (!text.trim()) {
          console.warn(`[PDF] 第 ${i} 页没有可提取的文本，可能是图片型 PDF`);
          // 尝试将页面渲染为图片
          try {
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            if (context) {
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              await page.render({ canvas, canvasContext: context, viewport }).promise;
              const imageDataUrl = canvas.toDataURL('image/jpeg', 0.8);
              text = `<div style="text-align:center;"><img src="${imageDataUrl}" style="max-width:100%;height:auto;" alt="PDF Page ${i}"/></div>`;
            }
          } catch (renderError) {
            console.error(`[PDF] 第 ${i} 页渲染失败:`, renderError);
            text = '<div style="padding: 40px; text-align: center; color: #999;">此页面无法显示（可能是扫描版 PDF）</div>';
          }
        } else {
          // 有文本内容，转换为 HTML
          text = escapeHtml(text).replace(/\n/g, '<br/>').replace(/\s+/g, ' ');
        }

        chapters.push({
          id: i - 1,
          title: `第 ${i} 页`,
          content: `<div class="pdf-page" style="padding: 20px; min-height: 800px;">${text}</div>`,
        });

        // 更新进度
        if (i % 5 === 0 || i === totalPages) {
          const progress = 30 + Math.floor((i / totalPages) * 60);
          onProgress?.(progress);
          console.log(`[PDF] 已处理 ${i}/${totalPages} 页, 进度: ${progress}%`);
        }
      } catch (e) {
        console.error(`[PDF] 解析第 ${i} 页失败:`, e);
        // 单页解析失败，添加占位符
        chapters.push({
          id: i - 1,
          title: `第 ${i} 页 (解析失败)`,
          content: '<div class="pdf-page" style="padding: 20px; text-align: center; color: #999;">此页面解析失败</div>',
        });
      }
    }

    if (chapters.length === 0) {
      throw new Error('无法提取 PDF 内容');
    }

    onProgress?.(95);
    console.log('[PDF] 解析完成，共', chapters.length, '章');

    return {
      id: generateBookId(),
      title: file.name.replace('.pdf', ''),
      author: '未知作者',
      format: 'pdf',
      cover,
      chapters,
      totalChapters: chapters.length,
      currentChapter: 0,
      currentPage: 0,
      addedAt: Date.now(),
    };
  } catch (error) {
    console.error('[PDF] 解析失败:', error);
    // 确保在出错时销毁 PDF 对象
    if (pdf) {
      try {
        await pdf.destroy();
      } catch (e) {
        console.error('销毁 PDF 对象失败:', e);
      }
    }
    throw new Error(`PDF 解析失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}

// 解析MOBI文件（简化处理，提示用户转换）
export async function parseMobi(file: File): Promise<Book> {
  // MOBI格式复杂，需要专用库，这里返回提示信息
  return {
    id: generateBookId(),
    title: file.name.replace(/\.\w+$/, ''),
    author: '未知作者',
    format: 'mobi',
    chapters: [{
      id: 0,
      title: '提示',
      content: `<div style="padding: 40px; text-align: center;">
        <h2>MOBI/AZW格式支持有限</h2>
        <p>建议您将文件转换为EPUB格式后重新上传</p>
        <p>您可以使用 Calibre 等工具进行转换</p>
      </div>`,
    }],
    totalChapters: 1,
    currentChapter: 0,
    currentPage: 0,
    addedAt: Date.now(),
  };
}

// 主解析函数
export async function parseBook(file: File, onProgress?: (progress: number) => void): Promise<Book> {
  const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
  console.log('[parseBook] 开始解析:', file.name, '格式:', ext);

  try {
    switch (ext) {
      case '.epub':
        return await parseEpub(file, onProgress);
      case '.txt':
        return await parseTxt(file, onProgress);
      case '.pdf':
        return await parsePdf(file, onProgress);
      case '.mobi':
      case '.azw':
      case '.azw3':
        return await parseMobi(file);
      default:
        throw new Error(`不支持的文件格式: ${ext}`);
    }
  } catch (error) {
    // 重新抛出错误，添加文件名上下文
    const message = error instanceof Error ? error.message : '未知错误';
    throw new Error(`解析文件 "${file.name}" 失败: ${message}`);
  }
}

// 生成唯一书籍ID
function generateBookId(): string {
  return 'book_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// HTML转义
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 验证解码后的文本是否有效
function isDecodedTextValid(text: string): boolean {
  if (!text || text.length === 0) return false;

  // 检查是否包含过多不可打印字符或乱码
  const invalidCharCount = (text.match(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g) || []).length;
  const totalChars = text.length;

  // 如果无效字符超过 5%，则认为解码失败
  if (invalidCharCount / totalChars > 0.05) {
    return false;
  }

  // 检查是否包含中文字符（常见于中文 TXT 文件）
  const hasChinese = /[\u4e00-\u9fa5]/.test(text);

  // 检查是否包含常见的中文字符或标点
  const hasCommonChinesePunctuation = /[，。！？；："'（）【】《》]/.test(text);

  // 如果有中文内容或常见标点，则认为是有效的
  if (hasChinese || hasCommonChinesePunctuation) {
    return true;
  }

  // 如果没有中文，检查是否包含基本的英文和标点
  const hasBasicText = /[a-zA-Z\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/.test(text);
  return hasBasicText;
}
