export interface Chapter {
  id: number;
  title: string;
  content: string;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  format: 'epub' | 'pdf' | 'txt' | 'mobi';
  cover?: string;
  chapters: Chapter[];
  totalChapters: number;
  currentChapter: number;
  currentPage: number;
  lastRead?: number;
  addedAt: number;
}

export interface ReadingSettings {
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  theme: 'light' | 'dark' | 'sepia' | 'green';
  backgroundImage?: string;
  pageTurnEffect: 'slide' | 'fade' | 'none';
  margin: number;
}

export const FONT_FAMILIES = [
  { value: 'system-ui', label: '系统默认' },
  { value: '"Noto Serif SC", serif', label: '思源宋体' },
  { value: '"Noto Sans SC", sans-serif', label: '思源黑体' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: '"Times New Roman", serif', label: 'Times New Roman' },
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: '"Microsoft YaHei", sans-serif', label: '微软雅黑' },
  { value: '"PingFang SC", sans-serif', label: '苹方' },
];

export const THEMES = [
  { value: 'light', label: '白天', bg: '#ffffff', text: '#333333' },
  { value: 'dark', label: '夜间', bg: '#1a1a1a', text: '#cccccc' },
  { value: 'sepia', label: ' sepia', bg: '#f4ecd8', text: '#5b4636' },
  { value: 'green', label: '护眼', bg: '#c7edcc', text: '#333333' },
];

export const PAGE_TURN_EFFECTS = [
  { value: 'slide', label: '滑动' },
  { value: 'fade', label: '淡入淡出' },
  { value: 'none', label: '无效果' },
];

export const DEFAULT_SETTINGS: ReadingSettings = {
  fontSize: 18,
  fontFamily: '"Noto Serif SC", serif',
  lineHeight: 1.8,
  theme: 'light',
  pageTurnEffect: 'slide',
  margin: 20,
};
