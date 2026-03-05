import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, Book, AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { parseBook } from '@/utils/ebookParser';
import { saveBook } from '@/utils/storage';
import type { Book as BookType } from '@/types/ebook';

interface FileUploaderProps {
  onUploadSuccess: (book: BookType) => void;
  onCancel?: () => void;
}

const SUPPORTED_FORMATS = ['.epub', '.pdf', '.txt', '.mobi', '.azw', '.azw3'];

export function FileUploader({ onUploadSuccess, onCancel }: FileUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [parsingFile, setParsingFile] = useState<string>('');

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    
    const file = acceptedFiles[0];
    setError(null);
    setUploading(true);
    setProgress(0);
    setParsingFile(file.name);
    
    try {
      // 模拟进度
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90));
      }, 200);
      
      // 解析书籍
      const book = await parseBook(file);
      
      clearInterval(progressInterval);
      setProgress(100);
      
      // 保存到本地存储
      await saveBook(book);
      
      // 通知父组件
      setTimeout(() => {
        onUploadSuccess(book);
        setUploading(false);
        setProgress(0);
        setParsingFile('');
      }, 500);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : '解析文件失败');
      setUploading(false);
      setProgress(0);
      setParsingFile('');
    }
  }, [onUploadSuccess]);

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: {
      'application/epub+zip': ['.epub'],
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt'],
      'application/x-mobipocket-ebook': ['.mobi'],
      'application/vnd.amazon.ebook': ['.azw'],
    },
    multiple: false,
    disabled: uploading,
  });

  const getDropzoneClass = () => {
    const baseClass = 'relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-300 ';
    if (isDragReject) {
      return baseClass + 'border-red-500 bg-red-50 dark:bg-red-950/20';
    }
    if (isDragActive) {
      return baseClass + 'border-primary bg-primary/5 scale-[1.02]';
    }
    if (uploading) {
      return baseClass + 'border-gray-300 bg-gray-50 dark:bg-gray-900 cursor-not-allowed';
    }
    return baseClass + 'border-gray-300 hover:border-primary hover:bg-gray-50 dark:hover:bg-gray-900';
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* 标题 */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">上传电子书</h2>
        {onCancel && (
          <Button variant="ghost" size="icon" onClick={onCancel}>
            <X className="w-5 h-5" />
          </Button>
        )}
      </div>

      {/* 错误提示 */}
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* 拖放区域 */}
      <div
        {...getRootProps()}
        className={getDropzoneClass()}
      >
        <input {...getInputProps()} />
        
        <div className="flex flex-col items-center gap-4">
          {uploading ? (
            <>
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
                <Book className="w-8 h-8 text-primary" />
              </div>
              <div className="space-y-2 w-full max-w-xs">
                <p className="text-sm font-medium">正在解析: {parsingFile}</p>
                <Progress value={progress} className="h-2" />
                <p className="text-xs text-muted-foreground">{progress}%</p>
              </div>
            </>
          ) : (
            <>
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                {isDragActive ? (
                  <Upload className="w-10 h-10 text-primary animate-bounce" />
                ) : (
                  <Upload className="w-10 h-10 text-primary" />
                )}
              </div>
              
              <div className="space-y-2">
                <p className="text-lg font-medium">
                  {isDragActive ? '释放以上传文件' : '拖放文件到此处'}
                </p>
                <p className="text-sm text-muted-foreground">
                  或点击选择文件
                </p>
              </div>
              
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                {SUPPORTED_FORMATS.map(format => (
                  <span
                    key={format}
                    className="px-3 py-1 text-xs font-medium bg-muted rounded-full"
                  >
                    {format}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 说明文字 */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
        <div className="p-4 rounded-lg bg-muted/50">
          <FileText className="w-6 h-6 mx-auto mb-2 text-primary" />
          <p className="text-sm font-medium">支持多种格式</p>
          <p className="text-xs text-muted-foreground">EPUB、PDF、TXT等</p>
        </div>
        <div className="p-4 rounded-lg bg-muted/50">
          <Book className="w-6 h-6 mx-auto mb-2 text-primary" />
          <p className="text-sm font-medium">自动解析章节</p>
          <p className="text-xs text-muted-foreground">智能识别目录结构</p>
        </div>
        <div className="p-4 rounded-lg bg-muted/50">
          <Upload className="w-6 h-6 mx-auto mb-2 text-primary" />
          <p className="text-sm font-medium">本地存储</p>
          <p className="text-xs text-muted-foreground">数据保存在浏览器中</p>
        </div>
      </div>
    </div>
  );
}
