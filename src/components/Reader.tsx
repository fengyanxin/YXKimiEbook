import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Settings, 
  List,
  Maximize,
  Minimize
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { Book, ReadingSettings } from '@/types/ebook';
import { THEMES } from '@/types/ebook';
import { updateReadingProgress } from '@/utils/storage';
import { SettingsPanel } from './SettingsPanel';
import { Toaster, toast } from 'sonner';

interface ReaderProps {
  book: Book;
  onBack: () => void;
  onUpdateBook: (book: Book) => void;
  settings: ReadingSettings;
  onUpdateSettings: (settings: ReadingSettings) => void;
}

export function Reader({ book, onBack, onUpdateBook, settings, onUpdateSettings }: ReaderProps) {
  const [currentChapter, setCurrentChapter] = useState(book.currentChapter || 0);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pageAnimation, setPageAnimation] = useState<'next' | 'prev' | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const readerRef = useRef<HTMLDivElement>(null);

  const chapter = book.chapters[currentChapter];
  const theme = THEMES.find(t => t.value === settings.theme) || THEMES[0];

  // 保存阅读进度
  useEffect(() => {
    const saveProgress = () => {
      updateReadingProgress(book.id, currentChapter, 0);
      onUpdateBook({
        ...book,
        currentChapter,
        currentPage: 0,
        lastRead: Date.now(),
      });
    };

    saveProgress();
  }, [currentChapter, book.id]);

  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goToPrevChapter();
      if (e.key === 'ArrowRight') goToNextChapter();
      if (e.key === 'Escape' && isFullscreen) toggleFullscreen();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentChapter, isFullscreen]);

  const goToNextChapter = useCallback(() => {
    if (currentChapter < book.totalChapters - 1) {
      if (settings.pageTurnEffect !== 'none') {
        setPageAnimation('next');
        setTimeout(() => {
          setCurrentChapter(prev => prev + 1);
          setPageAnimation(null);
          contentRef.current?.scrollTo(0, 0);
        }, 300);
      } else {
        setCurrentChapter(prev => prev + 1);
        contentRef.current?.scrollTo(0, 0);
      }
    } else {
      toast.info('已经是最后一章了');
    }
  }, [currentChapter, book.totalChapters, settings.pageTurnEffect]);

  const goToPrevChapter = useCallback(() => {
    if (currentChapter > 0) {
      if (settings.pageTurnEffect !== 'none') {
        setPageAnimation('prev');
        setTimeout(() => {
          setCurrentChapter(prev => prev - 1);
          setPageAnimation(null);
          contentRef.current?.scrollTo(0, 0);
        }, 300);
      } else {
        setCurrentChapter(prev => prev - 1);
        contentRef.current?.scrollTo(0, 0);
      }
    } else {
      toast.info('已经是第一章了');
    }
  }, [currentChapter, settings.pageTurnEffect]);

  const goToChapter = (index: number) => {
    setCurrentChapter(index);
    setShowSidebar(false);
    contentRef.current?.scrollTo(0, 0);
  };

  const toggleFullscreen = async () => {
    try {
      if (!isFullscreen) {
        await readerRef.current?.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
      setIsFullscreen(!isFullscreen);
    } catch (err) {
      console.error('全屏切换失败:', err);
    }
  };

  const getAnimationClass = () => {
    if (!pageAnimation) return '';
    if (settings.pageTurnEffect === 'slide') {
      return pageAnimation === 'next' ? 'animate-slide-left' : 'animate-slide-right';
    }
    if (settings.pageTurnEffect === 'fade') {
      return 'animate-fade';
    }
    return '';
  };

  return (
    <div 
      ref={readerRef}
      className="fixed inset-0 z-50 flex flex-col"
      style={{ 
        backgroundColor: theme.bg,
        color: theme.text,
      }}
    >
      <Toaster />
      
      {/* 顶部工具栏 */}
      <header 
        className="flex items-center justify-between px-4 py-3 border-b transition-colors"
        style={{ borderColor: `${theme.text}20` }}
      >
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            style={{ color: theme.text }}
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          
          <Sheet open={showSidebar} onOpenChange={setShowSidebar}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" style={{ color: theme.text }}>
                <List className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent 
              side="left" 
              className="w-80 p-0"
              style={{ backgroundColor: theme.bg, color: theme.text }}
            >
              <SheetHeader className="p-4 border-b" style={{ borderColor: `${theme.text}20` }}>
                <SheetTitle style={{ color: theme.text }}>目录</SheetTitle>
              </SheetHeader>
              <ScrollArea className="h-[calc(100vh-80px)]">
                <div className="py-2">
                  {book.chapters.map((ch, index) => (
                    <button
                      key={ch.id}
                      onClick={() => goToChapter(index)}
                      className={cn(
                        "w-full text-left px-4 py-3 text-sm transition-colors hover:bg-black/5",
                        currentChapter === index && "bg-primary/10 font-medium text-primary"
                      )}
                    >
                      <span className="truncate block">{ch.title}</span>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </SheetContent>
          </Sheet>
          
          <div className="hidden sm:block">
            <h1 className="text-sm font-medium truncate max-w-xs">{book.title}</h1>
            <p className="text-xs opacity-60">{chapter?.title}</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSettings(true)}
            style={{ color: theme.text }}
          >
            <Settings className="w-5 h-5" />
          </Button>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleFullscreen}
            style={{ color: theme.text }}
          >
            {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
          </Button>
        </div>
      </header>

      {/* 阅读内容区域 */}
      <div 
        ref={contentRef}
        className="flex-1 overflow-y-auto overflow-x-hidden"
        style={{ 
          scrollBehavior: 'smooth',
        }}
      >
        <div 
          className={cn(
            "max-w-3xl mx-auto px-4 sm:px-8 py-8 min-h-full",
            getAnimationClass()
          )}
          style={{
            fontSize: `${settings.fontSize}px`,
            fontFamily: settings.fontFamily,
            lineHeight: settings.lineHeight,
            paddingLeft: `${settings.margin}px`,
            paddingRight: `${settings.margin}px`,
          }}
        >
          {/* 章节标题 */}
          <h2 
            className="text-2xl font-bold mb-8 text-center"
            style={{ fontSize: `${settings.fontSize * 1.5}px` }}
          >
            {chapter?.title}
          </h2>
          
          {/* 章节内容 */}
          <div 
            className="prose prose-lg max-w-none reader-content"
            style={{ 
              color: theme.text,
            }}
            dangerouslySetInnerHTML={{ __html: chapter?.content || '' }}
          />
          
          {/* 章节导航 */}
          <div className="flex items-center justify-between mt-12 pt-8 border-t" style={{ borderColor: `${theme.text}20` }}>
            <Button
              variant="outline"
              onClick={goToPrevChapter}
              disabled={currentChapter === 0}
              className="gap-2"
              style={{ borderColor: `${theme.text}30`, color: theme.text }}
            >
              <ChevronLeft className="w-4 h-4" />
              上一章
            </Button>
            
            <span className="text-sm opacity-60">
              {currentChapter + 1} / {book.totalChapters}
            </span>
            
            <Button
              variant="outline"
              onClick={goToNextChapter}
              disabled={currentChapter >= book.totalChapters - 1}
              className="gap-2"
              style={{ borderColor: `${theme.text}30`, color: theme.text }}
            >
              下一章
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* 底部进度条 */}
      <div 
        className="h-1 bg-black/10"
        style={{ backgroundColor: `${theme.text}10` }}
      >
        <div 
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${((currentChapter + 1) / book.totalChapters) * 100}%` }}
        />
      </div>

      {/* 设置面板 */}
      <SettingsPanel
        open={showSettings}
        onOpenChange={setShowSettings}
        settings={settings}
        onUpdateSettings={onUpdateSettings}
        theme={theme}
      />

      {/* 点击翻页区域（桌面端） */}
      <div className="hidden md:flex fixed inset-y-16 left-0 right-0 pointer-events-none">
        <div 
          className="w-1/4 pointer-events-auto cursor-w-resize"
          onClick={goToPrevChapter}
        />
        <div className="flex-1" />
        <div 
          className="w-1/4 pointer-events-auto cursor-e-resize"
          onClick={goToNextChapter}
        />
      </div>

      <style>{`
        @keyframes slide-left {
          0% { transform: translateX(0); opacity: 1; }
          50% { transform: translateX(-30px); opacity: 0; }
          100% { transform: translateX(0); opacity: 1; }
        }
        @keyframes slide-right {
          0% { transform: translateX(0); opacity: 1; }
          50% { transform: translateX(30px); opacity: 0; }
          100% { transform: translateX(0); opacity: 1; }
        }
        @keyframes fade {
          0% { opacity: 1; }
          50% { opacity: 0; }
          100% { opacity: 1; }
        }
        .animate-slide-left {
          animation: slide-left 0.3s ease-in-out;
        }
        .animate-slide-right {
          animation: slide-right 0.3s ease-in-out;
        }
        .animate-fade {
          animation: fade 0.3s ease-in-out;
        }
      `}</style>
    </div>
  );
}
