import { Type, Palette, BookOpen, Sliders } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ReadingSettings } from '@/types/ebook';
import { THEMES, FONT_FAMILIES, PAGE_TURN_EFFECTS } from '@/types/ebook';

interface SettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: ReadingSettings;
  onUpdateSettings: (settings: ReadingSettings) => void;
  theme: { value: string; label: string; bg: string; text: string };
}

const BACKGROUND_IMAGES = [
  { value: '', label: '无' },
  { value: 'paper', label: '纸张纹理' },
  { value: 'wood', label: '木质纹理' },
  { value: 'fabric', label: '布纹' },
];

export function SettingsPanel({ open, onOpenChange, settings, onUpdateSettings, theme }: SettingsPanelProps) {
  const updateSetting = <K extends keyof ReadingSettings>(key: K, value: ReadingSettings[K]) => {
    onUpdateSettings({ ...settings, [key]: value });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent 
        side="right" 
        className="w-full sm:w-96 p-0 overflow-hidden"
        style={{ backgroundColor: theme.bg, color: theme.text }}
      >
        <SheetHeader className="p-4 border-b" style={{ borderColor: `${theme.text}20` }}>
          <SheetTitle style={{ color: theme.text }}>阅读设置</SheetTitle>
        </SheetHeader>

        <Tabs defaultValue="font" className="w-full">
          <TabsList className="w-full grid grid-cols-4 rounded-none border-b" style={{ backgroundColor: `${theme.text}10` }}>
            <TabsTrigger value="font" className="flex flex-col items-center gap-1 py-3">
              <Type className="w-4 h-4" />
              <span className="text-xs">字体</span>
            </TabsTrigger>
            <TabsTrigger value="theme" className="flex flex-col items-center gap-1 py-3">
              <Palette className="w-4 h-4" />
              <span className="text-xs">主题</span>
            </TabsTrigger>
            <TabsTrigger value="layout" className="flex flex-col items-center gap-1 py-3">
              <BookOpen className="w-4 h-4" />
              <span className="text-xs">布局</span>
            </TabsTrigger>
            <TabsTrigger value="effect" className="flex flex-col items-center gap-1 py-3">
              <Sliders className="w-4 h-4" />
              <span className="text-xs">效果</span>
            </TabsTrigger>
          </TabsList>

          {/* 字体设置 */}
          <TabsContent value="font" className="p-4 space-y-6">
            {/* 字体大小 */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label style={{ color: theme.text }}>字体大小</Label>
                <span className="text-sm opacity-60">{settings.fontSize}px</span>
              </div>
              <Slider
                value={[settings.fontSize]}
                onValueChange={([value]) => updateSetting('fontSize', value)}
                min={12}
                max={32}
                step={1}
              />
              <div className="flex justify-between text-xs opacity-40">
                <span>A</span>
                <span className="text-lg">A</span>
              </div>
            </div>

            {/* 字体选择 */}
            <div className="space-y-3">
              <Label style={{ color: theme.text }}>字体</Label>
              <RadioGroup
                value={settings.fontFamily}
                onValueChange={(value) => updateSetting('fontFamily', value)}
                className="grid grid-cols-1 gap-2"
              >
                {FONT_FAMILIES.map((font) => (
                  <div key={font.value} className="flex items-center space-x-2">
                    <RadioGroupItem value={font.value} id={font.value} />
                    <Label 
                      htmlFor={font.value} 
                      className="cursor-pointer"
                      style={{ fontFamily: font.value, color: theme.text }}
                    >
                      {font.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {/* 行高 */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label style={{ color: theme.text }}>行高</Label>
                <span className="text-sm opacity-60">{settings.lineHeight}</span>
              </div>
              <Slider
                value={[settings.lineHeight]}
                onValueChange={([value]) => updateSetting('lineHeight', value)}
                min={1}
                max={3}
                step={0.1}
              />
            </div>
          </TabsContent>

          {/* 主题设置 */}
          <TabsContent value="theme" className="p-4 space-y-6">
            <div className="space-y-3">
              <Label style={{ color: theme.text }}>阅读主题</Label>
              <div className="grid grid-cols-2 gap-3">
                {THEMES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => updateSetting('theme', t.value as any)}
                    className={`p-4 rounded-lg border-2 transition-all text-left ${
                      settings.theme === t.value 
                        ? 'border-primary ring-2 ring-primary/20' 
                        : 'border-transparent hover:scale-[1.02]'
                    }`}
                    style={{ backgroundColor: t.bg, color: t.text }}
                  >
                    <div className="font-medium">{t.label}</div>
                    <div className="text-xs opacity-60 mt-1">{t.bg}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 背景图片 */}
            <div className="space-y-3">
              <Label style={{ color: theme.text }}>背景纹理</Label>
              <RadioGroup
                value={settings.backgroundImage || ''}
                onValueChange={(value) => updateSetting('backgroundImage', value || undefined)}
                className="grid grid-cols-2 gap-2"
              >
                {BACKGROUND_IMAGES.map((bg) => (
                  <div key={bg.value} className="flex items-center space-x-2">
                    <RadioGroupItem value={bg.value} id={bg.value} />
                    <Label htmlFor={bg.value} className="cursor-pointer" style={{ color: theme.text }}>
                      {bg.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          </TabsContent>

          {/* 布局设置 */}
          <TabsContent value="layout" className="p-4 space-y-6">
            {/* 边距 */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label style={{ color: theme.text }}>页面边距</Label>
                <span className="text-sm opacity-60">{settings.margin}px</span>
              </div>
              <Slider
                value={[settings.margin]}
                onValueChange={([value]) => updateSetting('margin', value)}
                min={0}
                max={100}
                step={5}
              />
            </div>

            {/* 预览 */}
            <div className="space-y-3">
              <Label style={{ color: theme.text }}>预览</Label>
              <div 
                className="p-4 rounded-lg border"
                style={{ 
                  backgroundColor: theme.bg, 
                  color: theme.text,
                  borderColor: `${theme.text}30`,
                  fontSize: `${settings.fontSize}px`,
                  fontFamily: settings.fontFamily,
                  lineHeight: settings.lineHeight,
                  paddingLeft: `${settings.margin}px`,
                  paddingRight: `${settings.margin}px`,
                }}
              >
                <p>这是一段预览文字，用于展示当前的阅读设置效果。</p>
                <p>字体大小、行高和边距都会在这里实时预览。</p>
              </div>
            </div>
          </TabsContent>

          {/* 效果设置 */}
          <TabsContent value="effect" className="p-4 space-y-6">
            <div className="space-y-3">
              <Label style={{ color: theme.text }}>翻页效果</Label>
              <RadioGroup
                value={settings.pageTurnEffect}
                onValueChange={(value) => updateSetting('pageTurnEffect', value as any)}
                className="grid grid-cols-1 gap-2"
              >
                {PAGE_TURN_EFFECTS.map((effect) => (
                  <div key={effect.value} className="flex items-center space-x-2">
                    <RadioGroupItem value={effect.value} id={effect.value} />
                    <Label htmlFor={effect.value} className="cursor-pointer" style={{ color: theme.text }}>
                      {effect.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
