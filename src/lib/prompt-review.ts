export const PROMPT_PROTECTION = [
  '固定保护要求：输入原图是唯一玩偶身份依据，保留外形、比例、姿态、朝向、颜色、针织纹理、开衫纽扣与配件所在一侧；不镜像、转身、替换或增加玩偶。',
  '交付完整3:4微海报，文字清晰准确，不虚构价格、日期、品牌或商品信息。以上固定要求优先于编辑内容。'
].join('\n');

export function reviewedImagePrompt(value: string): string {
  return `${value.split(PROMPT_PROTECTION).join('').trim().slice(0, 8000)}\n${PROMPT_PROTECTION}`;
}
