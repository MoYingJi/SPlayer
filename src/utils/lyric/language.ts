import type { LyricLine } from "@applemusic-like-lyrics/lyric";

/** 歌词行语言类型 */
export type LyricLanguage = "ja" | "ko" | "zh-CN" | "und-Latn";

/** 附加了语言信息的歌词行 */
export type LyricLineWithLanguage = LyricLine & { language?: LyricLanguage };

/** 日语假名：平假名 + 片假名 + 半角假名 + 促音/长音符号 */
const KANA_RE = /[\p{Script=Hiragana}\p{Script=Katakana}\u30FC\uFF66-\uFF9F]/u;

/** 韩文：谚文音节 + 谚文字母 + 谚文兼容字母 */
const HANGUL_RE = /[\p{Script=Hangul}\u3130-\u318F]/u;

/** 中日韩统一表意文字（含扩展 A 区） */
const HAN_RE = /\p{Script=Han}/u;

/** 拉丁字母；数字与标点不能作为英文判断依据 */
const LATIN_RE = /\p{Script=Latin}/u;

/**
 * 检测单段歌词文本的语言（无上下文感知，作为逐行/逐词降级方案）
 * @param lyric 歌词内容
 * @returns 语言代码
 */
export const getLyricLanguage = (lyric: string): LyricLanguage => {
  if (!lyric || typeof lyric !== "string") return "und-Latn";
  if (KANA_RE.test(lyric)) return "ja";
  if (HANGUL_RE.test(lyric)) return "ko";
  if (HAN_RE.test(lyric)) return "zh-CN";
  if (LATIN_RE.test(lyric)) return "und-Latn";
  return "und-Latn";
};

/** 判断是否有实质内容的翻译歌词 */
const hasTranslation = (line: LyricLine): boolean => line.translatedLyric.trim().length > 0;

/**
 * 为歌词行补充语言信息
 *
 * Han 脚本无法独立区分中日韩；
 * - 同一首歌词出现假名时，通常将纯汉字行视为日语；
 * - 同一首歌词出现谚文时，通常将纯汉字行视为韩语；
 * - CJK 混合启发式规则：若所有包含假名/谚文的行均有翻译，
 *   则认定全为汉字且无翻译的行为中文，以此区分双语混合歌词。
 * - 拉丁文字使用 BCP 47 的 und-Latn，避免误标为英语。
 *
 * @param lines - 已解析的整首歌词
 */
export const applyLyricLanguages = (lines: LyricLine[]): void => {
  const lineContents = lines.map((line) => line.words.map((word) => word.word).join(""));

  let hasKana = false;
  let hasHangul = false;
  let kanaUntranslatedCount = 0;
  let hangulUntranslatedCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const content = lineContents[i];
    const isTranslated = hasTranslation(lines[i]);

    if (KANA_RE.test(content)) {
      hasKana = true;
      if (!isTranslated) kanaUntranslatedCount++;
    }
    if (HANGUL_RE.test(content)) {
      hasHangul = true;
      if (!isTranslated) hangulUntranslatedCount++;
    }
  }

  const allKanaTranslated = hasKana && kanaUntranslatedCount === 0;
  const allHangulTranslated = hasHangul && hangulUntranslatedCount === 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const content = lineContents[i];
    const isTranslated = hasTranslation(line);

    let lang: LyricLanguage | undefined;

    if (KANA_RE.test(content)) {
      lang = "ja";
    } else if (HANGUL_RE.test(content)) {
      lang = "ko";
    } else if (HAN_RE.test(content)) {
      if (hasKana) {
        lang = allKanaTranslated && !isTranslated ? "zh-CN" : "ja";
      } else if (hasHangul) {
        lang = allHangulTranslated && !isTranslated ? "zh-CN" : "ko";
      } else {
        lang = "zh-CN";
      }
    } else if (LATIN_RE.test(content)) {
      lang = "und-Latn";
    }

    // 运行时动态附加 language 属性
    (line as LyricLineWithLanguage).language = lang;
  }
};
