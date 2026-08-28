import type { LyricLine } from "@applemusic-like-lyrics/lyric";
import type { LyricLine as LyricLineWithRuby } from "@applemusic-like-lyrics/core";

/** 歌词行语言类型 */
export type LyricLanguage = LyricLanguageCJK | "und-Latn";

export type LyricLanguageCJK = "zh-CN" | "ja" | "ko";

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
  const lineContents = lines.map((line) =>
    (line as LyricLineWithRuby).words
      .map((word) => `${word.word}${word.ruby ? `(${word.ruby})` : ""}`)
      .join(""),
  );

  // 统计全局行级 CJK 特征
  let hanLineCount = 0;
  let kanaLineCount = 0;
  let hangulLineCount = 0;
  let hanTranslatedCount = 0;
  let kanaTranslatedCount = 0;
  let hangulTranslatedCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const content = lineContents[i];
    const isTranslated = hasTranslation(lines[i]);

    if (HAN_RE.test(content)) {
      hanLineCount++;
      if (isTranslated) hanTranslatedCount++;
    }
    if (KANA_RE.test(content)) {
      kanaLineCount++;
      if (isTranslated) kanaTranslatedCount++;
    }
    if (HANGUL_RE.test(content)) {
      hangulLineCount++;
      if (isTranslated) hangulTranslatedCount++;
    }
  }

  const hasHan = hanLineCount > 0;
  const hasKana = kanaLineCount > 0;
  const hasHangul = hangulLineCount > 0;

  // CJK 翻译启发式标志
  const allKanaTranslated = hasKana && kanaTranslatedCount === kanaLineCount;
  const allHangulTranslated = hasHangul && hangulTranslatedCount === hangulLineCount;

  // CJK 比例启发式标志
  const allHanUntranslated = hasHan && hanTranslatedCount === hanLineCount;
  const allKanaUntranslated = hasKana && kanaTranslatedCount === kanaLineCount;
  const allHangulUntranslated = hasHangul && hangulTranslatedCount === hangulLineCount;
  const kanaRatio = hasHan ? kanaLineCount / hanLineCount : Infinity;
  const hangulRatio = hasHan ? hangulLineCount / hanLineCount : Infinity;
  const THRESHOLD = 0.3;

  // 判断纯汉字行的语言
  const getPureHanLineLang = (line: LyricLine): LyricLanguageCJK => {
    const isTranslated = hasTranslation(line);

    if (hasKana) {
      if (allKanaTranslated) {
        return isTranslated ? "ja" : "zh-CN";
      } else if (allHanUntranslated && allKanaUntranslated) {
        return kanaRatio > THRESHOLD ? "ja" : "zh-CN";
      } else {
        return hasKana ? "ja" : "zh-CN";
      }
    }

    if (hasHangul) {
      if (allHangulTranslated) {
        return isTranslated ? "ko" : "zh-CN";
      } else if (allHanUntranslated && allHangulUntranslated) {
        return hangulRatio > THRESHOLD ? "ko" : "zh-CN";
      } else {
        return hasHangul ? "ko" : "zh-CN";
      }
    }

    return "zh-CN";
  };

  // 逐行标注
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const content = lineContents[i];

    let lang: LyricLanguage | undefined;

    if (KANA_RE.test(content)) {
      lang = "ja";
    } else if (HANGUL_RE.test(content)) {
      lang = "ko";
    } else if (HAN_RE.test(content)) {
      lang = getPureHanLineLang(line);
    } else if (LATIN_RE.test(content)) {
      lang = "und-Latn";
    }

    // 运行时动态附加 language 属性
    (line as LyricLineWithLanguage).language = lang;
  }
};
