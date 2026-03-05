import localforage from 'localforage';
import type { Book, ReadingSettings } from '@/types/ebook';
import { DEFAULT_SETTINGS } from '@/types/ebook';

// 配置localforage
localforage.config({
  name: 'EbookReader',
  storeName: 'books',
  description: '电子书阅读器存储',
});

// 书籍存储
const bookStore = localforage.createInstance({
  name: 'EbookReader',
  storeName: 'books',
});

// 设置存储
const settingsStore = localforage.createInstance({
  name: 'EbookReader',
  storeName: 'settings',
});

// 保存书籍
export async function saveBook(book: Book): Promise<void> {
  await bookStore.setItem(book.id, book);
}

// 获取书籍
export async function getBook(bookId: string): Promise<Book | null> {
  return await bookStore.getItem<Book>(bookId);
}

// 获取所有书籍
export async function getAllBooks(): Promise<Book[]> {
  const books: Book[] = [];
  await bookStore.iterate<Book, void>((book) => {
    books.push(book);
  });
  return books.sort((a, b) => (b.lastRead || 0) - (a.lastRead || 0));
}

// 删除书籍
export async function deleteBook(bookId: string): Promise<void> {
  await bookStore.removeItem(bookId);
}

// 更新阅读进度
export async function updateReadingProgress(
  bookId: string,
  chapter: number,
  page: number
): Promise<void> {
  const book = await getBook(bookId);
  if (book) {
    book.currentChapter = chapter;
    book.currentPage = page;
    book.lastRead = Date.now();
    await saveBook(book);
  }
}

// 保存设置
export async function saveSettings(settings: ReadingSettings): Promise<void> {
  await settingsStore.setItem('readingSettings', settings);
}

// 获取设置
export async function getSettings(): Promise<ReadingSettings> {
  const settings = await settingsStore.getItem<ReadingSettings>('readingSettings');
  return settings || DEFAULT_SETTINGS;
}

// 导出书籍数据
export async function exportBookData(bookId: string): Promise<string> {
  const book = await getBook(bookId);
  if (!book) throw new Error('书籍不存在');
  return JSON.stringify(book);
}

// 导入书籍数据
export async function importBookData(jsonData: string): Promise<Book> {
  const book = JSON.parse(jsonData) as Book;
  book.id = 'book_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  book.addedAt = Date.now();
  await saveBook(book);
  return book;
}
