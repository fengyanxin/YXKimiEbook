import { useState, useEffect, useCallback } from 'react';
import { Plus, BookOpen, Library, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Toaster, toast } from 'sonner';
import { FileUploader } from '@/components/FileUploader';
import { BookList } from '@/components/BookList';
import { Reader } from '@/components/Reader';
import type { Book, ReadingSettings } from '@/types/ebook';
import { DEFAULT_SETTINGS } from '@/types/ebook';
import { getAllBooks, deleteBook, getSettings, saveSettings } from '@/utils/storage';
import './App.css';

type ViewMode = 'library' | 'upload' | 'read';

function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('library');
  const [books, setBooks] = useState<Book[]>([]);
  const [currentBook, setCurrentBook] = useState<Book | null>(null);
  const [settings, setSettings] = useState<ReadingSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [showClearDialog, setShowClearDialog] = useState(false);

  // 初始化加载
  useEffect(() => {
    const init = async () => {
      try {
        const [loadedBooks, loadedSettings] = await Promise.all([
          getAllBooks(),
          getSettings(),
        ]);
        setBooks(loadedBooks);
        setSettings(loadedSettings);
      } catch (error) {
        console.error('初始化失败:', error);
        toast.error('加载数据失败');
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, []);

  // 处理上传成功
  const handleUploadSuccess = useCallback((book: Book) => {
    setBooks(prev => [book, ...prev]);
    setViewMode('library');
    toast.success(`《${book.title}》上传成功`);
  }, []);

  // 开始阅读
  const handleReadBook = useCallback((book: Book) => {
    setCurrentBook(book);
    setViewMode('read');
  }, []);

  // 更新书籍
  const handleUpdateBook = useCallback((updatedBook: Book) => {
    setBooks(prev => 
      prev.map(b => b.id === updatedBook.id ? updatedBook : b)
    );
    setCurrentBook(updatedBook);
  }, []);

  // 删除书籍
  const handleDeleteBook = useCallback(async (bookId: string) => {
    try {
      await deleteBook(bookId);
      setBooks(prev => prev.filter(b => b.id !== bookId));
      if (currentBook?.id === bookId) {
        setCurrentBook(null);
        setViewMode('library');
      }
      toast.success('书籍已删除');
    } catch (error) {
      toast.error('删除失败');
    }
  }, [currentBook]);

  // 更新设置
  const handleUpdateSettings = useCallback(async (newSettings: ReadingSettings) => {
    setSettings(newSettings);
    await saveSettings(newSettings);
  }, []);

  // 清空所有数据
  const handleClearAll = useCallback(async () => {
    try {
      for (const book of books) {
        await deleteBook(book.id);
      }
      setBooks([]);
      setCurrentBook(null);
      setViewMode('library');
      setShowClearDialog(false);
      toast.success('所有数据已清空');
    } catch (error) {
      toast.error('清空失败');
    }
  }, [books]);

  // 返回书库
  const handleBackToLibrary = useCallback(() => {
    setViewMode('library');
    setCurrentBook(null);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    );
  }

  // 阅读模式
  if (viewMode === 'read' && currentBook) {
    return (
      <Reader
        book={currentBook}
        onBack={handleBackToLibrary}
        onUpdateBook={handleUpdateBook}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Toaster position="top-center" />

      {/* 顶部导航 */}
      <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold">电子书阅读器</h1>
              <p className="text-xs text-muted-foreground hidden sm:block">
                支持 EPUB、PDF、TXT 等多种格式
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {books.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowClearDialog(true)}
                className="hidden sm:flex text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                清空
              </Button>
            )}
            
            <Button
              onClick={() => setViewMode(viewMode === 'upload' ? 'library' : 'upload')}
              className="gap-2"
            >
              {viewMode === 'upload' ? (
                <>
                  <Library className="w-4 h-4" />
                  <span className="hidden sm:inline">返回书库</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">上传书籍</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="container mx-auto px-4 py-8">
        {viewMode === 'upload' ? (
          <FileUploader
            onUploadSuccess={handleUploadSuccess}
            onCancel={() => setViewMode('library')}
          />
        ) : (
          <div className="space-y-6">
            {/* 统计信息 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
                <div className="text-2xl font-bold text-primary">{books.length}</div>
                <div className="text-sm text-muted-foreground">总书籍</div>
              </div>
              <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/10">
                <div className="text-2xl font-bold text-blue-600">
                  {books.filter(b => b.format === 'epub').length}
                </div>
                <div className="text-sm text-muted-foreground">EPUB</div>
              </div>
              <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/10">
                <div className="text-2xl font-bold text-red-600">
                  {books.filter(b => b.format === 'pdf').length}
                </div>
                <div className="text-sm text-muted-foreground">PDF</div>
              </div>
              <div className="p-4 rounded-xl bg-gray-500/5 border border-gray-500/10">
                <div className="text-2xl font-bold text-gray-600">
                  {books.filter(b => b.format === 'txt').length}
                </div>
                <div className="text-sm text-muted-foreground">TXT</div>
              </div>
            </div>

            {/* 书籍列表 */}
            <div>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Library className="w-5 h-5" />
                我的书库
              </h2>
              <BookList
                books={books}
                onReadBook={handleReadBook}
                onDeleteBook={handleDeleteBook}
                currentBookId={currentBook?.id}
              />
            </div>
          </div>
        )}
      </main>

      {/* 底部信息 */}
      <footer className="border-t mt-auto">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
            <p>电子书阅读工具 - 支持 EPUB、PDF、TXT、MOBI 格式</p>
            <p>数据存储在本地浏览器中</p>
          </div>
        </div>
      </footer>

      {/* 清空确认对话框 */}
      <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认清空</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            确定要删除所有书籍吗？此操作无法撤销。
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowClearDialog(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleClearAll}>
              确认清空
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default App;
