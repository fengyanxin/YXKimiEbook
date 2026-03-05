import JSZip from 'jszip';
import type { Book, Chapter } from '@/types/ebook';

// 解析EPUB文件
export async function parseEpub(file: File): Promise<Book> {
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
export async function parseTxt(file: File): Promise<Book> {
  const text = await file.text();
  const lines = text.split('\n');
  
  // 尝试提取标题（第一行）
  let title = lines[0]?.trim() || file.name.replace('.txt', '');
  if (title.length > 50) title = title.substring(0, 50);
  
  // 尝试提取作者（第二行可能包含作者信息）
  let author = '未知作者';
  if (lines[1]?.includes('作者')) {
    author = lines[1].replace(/作者[:：\s]*/i, '').trim();
  }
  
  // 解析章节
  const chapters: Chapter[] = [];
  const chapterRegex = /^(第[一二三四五六七八九十百千万\d]+章|Chapter\s+\d+|\d+[\.、]|【.+?】|第\d+章)/i;
  
  let currentChapter: Chapter = {
    id: 0,
    title: '前言',
    content: '',
  };
  
  let lineIndex = 0;
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
    } else {
      currentChapter.content += line + '\n';
    }
    lineIndex++;
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
  
  // 将纯文本转换为HTML
  chapters.forEach(chapter => {
    chapter.content = `<div class="txt-content">${escapeHtml(chapter.content).replace(/\n/g, '<br/>')}</div>`;
  });
  
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
export async function parsePdf(file: File): Promise<Book> {
  const pdfjsLib = await import('pdfjs-dist');
  
  // 使用CDN worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
  
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
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
  } catch (e) {
    console.error('提取PDF封面失败:', e);
  }
  
  const chapters: Chapter[] = [];
  const totalPages = Math.min(pdf.numPages, 100); // 限制最多100页
  
  for (let i = 1; i <= totalPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const textItems = textContent.items.map((item: any) => item.str);
    const text = textItems.join(' ');
    
    chapters.push({
      id: i - 1,
      title: `第 ${i} 页`,
      content: `<div class="pdf-page" style="padding: 20px; min-height: 800px;">${escapeHtml(text).replace(/\n/g, '<br/>')}</div>`,
    });
  }
  
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
export async function parseBook(file: File): Promise<Book> {
  const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
  
  switch (ext) {
    case '.epub':
      return parseEpub(file);
    case '.txt':
      return parseTxt(file);
    case '.pdf':
      return parsePdf(file);
    case '.mobi':
    case '.azw':
    case '.azw3':
      return parseMobi(file);
    default:
      throw new Error(`不支持的文件格式: ${ext}`);
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
