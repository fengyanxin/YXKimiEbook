import { useState, useMemo } from 'react';
import { Book, Clock, Trash2, BookOpen, MoreVertical, FileText, Search, Grid3X3, List as ListIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from '@/components/ui/alert-dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { Book as BookType } from '@/types/ebook';
import { cn } from '@/lib/utils';

interface BookListProps {
  books: BookType[];
  onReadBook: (book: BookType) => void;
  onDeleteBook: (bookId: string) => void;
  currentBookId?: string;
}

type ViewMode = 'grid' | 'list';

const FORMAT_ICONS: Record<string, React.ReactNode> = {
  epub: <Book className="w-5 h-5" />,
  pdf: <FileText className="w-5 h-5" />,
  txt: <FileText className="w-5 h-5" />,
  mobi: <Book className="w-5 h-5" />,
};

const FORMAT_COLORS: Record<string, string> = {
  epub: 'bg-blue-500/10 text-blue-600',
  pdf: 'bg-red-500/10 text-red-600',
  txt: 'bg-gray-500/10 text-gray-600',
  mobi: 'bg-orange-500/10 text-orange-600',
};

const FORMAT_LABELS: Record<string, string> = {
  epub: 'EPUB',
  pdf: 'PDF',
  txt: 'TXT',
  mobi: 'MOBI',
};

export function BookList({ books, onReadBook, onDeleteBook, currentBookId }: BookListProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [bookToDelete, setBookToDelete] = useState<BookType | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  // 过滤书籍
  const filteredBooks = useMemo(() => {
    if (!searchQuery.trim()) return books;
    
    const query = searchQuery.toLowerCase();
    return books.filter(book => 
      book.title.toLowerCase().includes(query) ||
      book.author.toLowerCase().includes(query) ||
      book.format.toLowerCase().includes(query)
    );
  }, [books, searchQuery]);

  const handleDelete = (book: BookType) => {
    setBookToDelete(book);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (bookToDelete) {
      onDeleteBook(bookToDelete.id);
      setDeleteDialogOpen(false);
      setBookToDelete(null);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
    
    return date.toLocaleDateString('zh-CN');
  };

  // 空状态
  if (books.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center mb-4">
          <BookOpen className="w-12 h-12 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-2">还没有书籍</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          点击上方的上传按钮，添加您的第一本电子书
        </p>
      </div>
    );
  }

  // 搜索无结果
  if (filteredBooks.length === 0 && searchQuery) {
    return (
      <div className="space-y-4">
        {/* 搜索和视图切换工具栏 */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="搜索书名、作者..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <ToggleGroup type="single" value={viewMode} onValueChange={(v) => v && setViewMode(v as ViewMode)}>
            <ToggleGroupItem value="grid" aria-label="网格视图">
              <Grid3X3 className="w-4 h-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="列表视图">
              <ListIcon className="w-4 h-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Search className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">未找到匹配的书籍</h3>
          <p className="text-sm text-muted-foreground">
            尝试使用其他关键词搜索
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 搜索和视图切换工具栏 */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="搜索书名、作者..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          共 {filteredBooks.length} 本
        </span>
        <ToggleGroup type="single" value={viewMode} onValueChange={(v) => v && setViewMode(v as ViewMode)}>
          <ToggleGroupItem value="grid" aria-label="网格视图">
            <Grid3X3 className="w-4 h-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label="列表视图">
            <ListIcon className="w-4 h-4" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* 网格视图 */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredBooks.map((book) => (
            <Card 
              key={book.id}
              className={cn(
                "group cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 overflow-hidden",
                currentBookId === book.id && "ring-2 ring-primary"
              )}
              onClick={() => onReadBook(book)}
            >
              {/* 封面图 */}
              <div className="relative h-40 bg-muted overflow-hidden">
                {book.cover ? (
                  <img 
                    src={book.cover} 
                    alt={book.title}
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  />
                ) : (
                  <div className={cn(
                    "w-full h-full flex items-center justify-center",
                    FORMAT_COLORS[book.format] || 'bg-gray-500/10 text-gray-600'
                  )}>
                    {FORMAT_ICONS[book.format] || <Book className="w-12 h-12" />}
                  </div>
                )}
                {/* 格式标签 */}
                <span className={cn(
                  "absolute top-2 right-2 px-2 py-0.5 text-xs font-medium rounded-full",
                  "bg-black/60 text-white backdrop-blur-sm"
                )}>
                  {FORMAT_LABELS[book.format] || book.format.toUpperCase()}
                </span>
              </div>
              
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium truncate mb-1" title={book.title}>
                      {book.title}
                    </h3>
                    <p className="text-sm text-muted-foreground truncate">
                      {book.author}
                    </p>
                  </div>

                  {/* 操作菜单 */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="opacity-0 group-hover:opacity-100 transition-opacity -mr-2 -mt-2"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        onReadBook(book);
                      }}>
                        <BookOpen className="w-4 h-4 mr-2" />
                        阅读
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(book);
                        }}
                        className="text-destructive"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        删除
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* 阅读进度 */}
                <div className="mt-3 pt-3 border-t flex items-center justify-between text-xs text-muted-foreground">
                  {book.lastRead ? (
                    <>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{formatDate(book.lastRead)}</span>
                      </div>
                      <span>第 {book.currentChapter + 1}/{book.totalChapters} 章</span>
                    </>
                  ) : (
                    <span>{book.totalChapters} 章</span>
                  )}
                </div>

                {/* 进度条 */}
                <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all"
                    style={{ 
                      width: `${((book.currentChapter + 1) / book.totalChapters) * 100}%` 
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 列表视图 */}
      {viewMode === 'list' && (
        <div className="space-y-2">
          {filteredBooks.map((book) => (
            <div
              key={book.id}
              className={cn(
                "group flex items-center gap-4 p-3 rounded-lg border cursor-pointer transition-all hover:bg-muted/50",
                currentBookId === book.id && "ring-2 ring-primary border-primary"
              )}
              onClick={() => onReadBook(book)}
            >
              {/* 封面/图标 */}
              <div className="relative w-12 h-16 flex-shrink-0 rounded overflow-hidden">
                {book.cover ? (
                  <img 
                    src={book.cover} 
                    alt={book.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className={cn(
                    "w-full h-full flex items-center justify-center",
                    FORMAT_COLORS[book.format] || 'bg-gray-500/10 text-gray-600'
                  )}>
                    {FORMAT_ICONS[book.format] || <Book className="w-6 h-6" />}
                  </div>
                )}
              </div>

              {/* 信息 */}
              <div className="flex-1 min-w-0">
                <h3 className="font-medium truncate" title={book.title}>
                  {book.title}
                </h3>
                <p className="text-sm text-muted-foreground truncate">
                  {book.author} · {book.totalChapters} 章
                </p>
              </div>

              {/* 格式标签 */}
              <span className={cn(
                "px-2 py-0.5 text-xs font-medium rounded-full hidden sm:block",
                FORMAT_COLORS[book.format] || 'bg-gray-500/10 text-gray-600'
              )}>
                {FORMAT_LABELS[book.format] || book.format.toUpperCase()}
              </span>

              {/* 阅读进度 */}
              {book.lastRead && (
                <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  <span>{formatDate(book.lastRead)}</span>
                  <span className="text-xs">(第 {book.currentChapter + 1} 章)</span>
                </div>
              )}

              {/* 进度条 */}
              <div className="hidden sm:block w-24">
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all"
                    style={{ 
                      width: `${((book.currentChapter + 1) / book.totalChapters) * 100}%` 
                    }}
                  />
                </div>
              </div>

              {/* 操作 */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={(e) => {
                    e.stopPropagation();
                    onReadBook(book);
                  }}>
                    <BookOpen className="w-4 h-4 mr-2" />
                    阅读
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(book);
                    }}
                    className="text-destructive"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    删除
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      )}

      {/* 删除确认对话框 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除《{bookToDelete?.title}》吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
