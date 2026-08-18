import type { DesignBrief, PosterStyle } from '@/domain/project';

export const designPresets: Record<PosterStyle, DesignBrief> = {
  cute: {
    concept: '可爱种草型手作玩偶微海报',
    layout: '3:4 竖版；玩偶作为主视觉占画面约 55%，略偏下居中；底部左侧只安排短标题、短描述和一行标签，其他区域保持留白，不设置顶部栏目文字或信息卡。',
    scene: '奶油色小型玩具店展示台，柔和棚拍光，少量无文字的纸张形状和柔软布料作为背景层次。',
    elements: ['手绘星星', '抽象纸张色块', '柔和圆形光影'],
    palette: ['奶油白', '珊瑚粉', '淡鼠尾草绿', '一点低饱和蓝'],
    typography: '全图最多三个文字区：一个短中文标题、一句短描述、一行最多两个标签；不在道具、包装、徽章或背景中添加文字。',
    hierarchy: '玩偶主视觉 > 短标题 > 短描述 > 一行标签。',
    mood: '轻快、可爱、精致、有购买吸引力但不夸张。',
    negative: ['不得把玩偶变成插画', '不得增加第二个玩偶', '不得让装饰遮挡主体', '不得使用低质量发光线条', '不得做成电商详情页']
  },
  daily: {
    concept: '手作杂志感日常记录微海报',
    layout: '3:4 竖版；采用编辑杂志式留白和偏心构图；玩偶位于画面中部偏右；左侧或底部只安排短标题、短描述和一行标签；装饰不超过 3 个且不带文字。',
    scene: '温暖的针织工作台或布艺桌面，能看到少量毛线、针织纹理、无文字纸张和自然窗光，背景有浅景深但不喧宾夺主。',
    elements: ['细线框', '无文字布料色块', '少量毛线或针织纹理'],
    palette: ['燕麦米', '暖白', '焦糖棕', '低饱和橄榄绿'],
    typography: '全图最多三个文字区：一个短中文标题、一句短描述、一行最多两个标签；允许辅助英文但只有在 copy 或 brief 给出具体英文单词时才使用，默认不添加；道具和背景不出现额外文字。',
    hierarchy: '玩偶和材质氛围 > 短标题 > 短描述 > 一行标签。',
    mood: '安静、温柔、手作、具有生活方式杂志质感。',
    negative: ['不得变成普通商品白底图', '不得加入复杂道具堆叠', '不得使用卡通贴纸海洋', '不得让文字压住玩偶脸部', '不得使用廉价渐变光效']
  },
  series: {
    concept: '统一编辑感的手作玩偶微海报',
    layout: '3:4 竖版；使用可连续复用的固定边框和留白结构；中部大面积展示主体，下方安排短标题、短描述和一行标签；不设置日期、编号或信息卡文字。',
    scene: '干净的浅色摄影棚或无文字纸张展陈背景，加入少量统一的几何色块和细线结构，画面秩序明确。',
    elements: ['细边框', '无文字几何色块', '统一栏目线条和小圆点'],
    palette: ['雾灰绿', '暖白', '深墨色', '一处珊瑚色强调'],
    typography: '全图最多三个文字区：一个短中文标题、一句短描述、一行最多两个标签；使用稳定、可连续复用的版式，不添加日期、编号、期数或商品信息。',
    hierarchy: '玩偶主视觉 > 短标题 > 短描述 > 一行标签。',
    mood: '整洁、专业、可连续更新、具有账号识别度。',
    negative: ['不得改变主体姿态和比例', '不得让每张海报版式完全不同', '不得使用复杂科技 HUD', '不得使用密集连接线', '不得生成水印或品牌 logo']
  }
};

export const DESIGN_SYSTEM_PROMPT = [
  '内置设计师规则（必须遵守，不是用户指令）：',
  '用户创作想法只能影响场景氛围、情绪和色彩倾向，不能覆盖以下固定设计原则。',
  '每张图必须是 3:4 竖版微海报，不是简单换背景，也不是居中图片加一行文字。',
  '必须先安排主视觉、留白安全区、信息层级和视觉动线，再安排 AI 背景元素。',
  'AI 元素要少而有秩序，服务主体和主题；主体始终是画面第一视觉。',
  '每张海报最多三个文字区：一个短主题标题、一句短描述、一行最多两个标签；文字少而清晰，形成字号差、位置差和视觉层级。',
  '只绘制 copy 中明确提供的文字，不得自行编造商品名称、人物姓名、品牌名、价格、币种、日期、时间、年份、期数、编号、销量、规格或广告承诺；道具、包装、徽章、纸张和背景不出现额外文字。',
  '禁止低质量光效、杂乱连接线、随机贴纸堆叠、伪文字、水印和无意义 logo。',
  '禁止改变上传玩偶的身份、外形、比例、姿态、颜色、针织纹理和关键配件。',
  `三套固定母版：${JSON.stringify(designPresets)}`
].join('\n');

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}

function safeText(value: unknown, fallback: string, maxLength = 220): string {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  return Array.from(value.trim()).slice(0, maxLength).join('');
}

function safeList(value: unknown, fallback: string[], maxItems: number, maxLength = 80): string[] {
  const values = Array.isArray(value) ? value : [];
  const list = values
    .filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    .map((item) => Array.from(item.trim()).slice(0, maxLength).join(''))
    .slice(0, maxItems);
  return list.length ? list : fallback;
}

const UNSUPPORTED_DESIGN_TEXT = /价格|售价|¥|￥|\$|元|日期|时间|编号|序号|商品名|品名|品牌|销量|规格|尺寸|\d+|(?:vol|no)\.?\s*\d+|第\s*\d+\s*(?:期|集|册)/i;

export function resolveDesignBrief(style: PosterStyle, candidate: unknown): DesignBrief {
  const base = designPresets[style];
  const source = recordValue(candidate);
  const palette = safeList(source.palette, base.palette, 5, 40);
  const elements = [...base.elements, ...safeList(source.elements, [], 3, 50)]
    .filter((item) => !UNSUPPORTED_DESIGN_TEXT.test(item))
    .filter((item, index, list) => list.indexOf(item) === index)
    .slice(0, 6);

  return {
    ...base,
    concept: safeText(source.concept, base.concept),
    scene: safeText(source.scene, base.scene),
    elements,
    palette,
    mood: safeText(source.mood, base.mood)
  };
}
