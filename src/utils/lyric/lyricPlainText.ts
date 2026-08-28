import type { LyricLine, LyricWord } from "@applemusic-like-lyrics/lyric";

/**
 * 「纯文本」歌词格式（不含任何时间戳）
 *
 * 格式约定：
 * - 每行一句歌词，空行表示删除该行（行数量仍需与原歌词一一对应）
 * - 逐字歌词使用 `|` 分割每个单词，单词之间存在时间空隙时用 `||`（抽象视作一个空白单词）
 * - 内容中的 `|` 转义为 `\|`，`\` 转义为 `\\`，与行首特殊前缀冲突时同样使用 `\` 转义
 * - 背景歌词行前缀 `<`，对唱歌词行前缀 `>`
 * - 翻译、音译行紧跟主行，前缀 `:`：第一行为翻译，第二行为音译，
 *   音译为逐字且存在单行音译时会额外输出第三行表示单行音译
 */

/** 单词分隔符 */
const WORD_SEPARATOR = "|";

/** 需要在行首额外转义的字符 */
const LINE_START_REGEX = /^[<>:]/;

/**
 * 转义内容中的 `\` 与 `|`
 */
const escapeWord = (text: string): string => text.replace(/[\\|]/g, (char) => `\\${char}`);

/**
 * 反转义（`\X` 一律还原为 `X`）
 */
const unescapeWord = (text: string): string => text.replace(/\\([\s\S])/g, "$1");

/**
 * 若内容以特殊前缀字符开头则额外转义
 */
const escapeLineStart = (text: string): string =>
  LINE_START_REGEX.test(text) ? `\\${text}` : text;

/**
 * 按未转义的 `|` 拆分为单词列表，并逐个反转义
 * 空字符串表示空白单词
 */
const splitWords = (raw: string): string[] => {
  const parts: string[] = [];
  let current = "";
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    if (char === "\\") {
      // 保留转义序列，等拆分完成后再统一反转义
      current += char;
      i++;
      if (i < raw.length) current += raw[i];
      continue;
    }
    if (char === WORD_SEPARATOR) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts.map(unescapeWord);
};

/**
 * 将 LyricLine 数组转换为纯文本格式
 * @param lines LyricLine 数组
 * @returns 纯文本格式字符串
 */
export const lyricLinesToPlainText = (lines: Readonly<LyricLine[]>): string => {
  const output: string[] = [];
  for (const line of lines) {
    // 主行与逐字音译行同步生成，保证空白单词一一对应
    const mainWords: string[] = [];
    const romanWords: string[] = [];
    const hasRomanWord = line.words.some((word) => !!word.romanWord);
    line.words.forEach((word, index) => {
      mainWords.push(escapeWord(word.word));
      romanWords.push(escapeWord(word.romanWord ?? ""));
      const nextWord = line.words[index + 1];
      // 单词之间存在时间空隙，插入空白单词
      if (nextWord && nextWord.startTime !== word.endTime) {
        mainWords.push("");
        romanWords.push("");
      }
    });
    const prefix = `${line.isBG ? "<" : ""}${line.isDuet ? ">" : ""}`;
    output.push(prefix + escapeLineStart(mainWords.join(WORD_SEPARATOR)));
    // 有音译时必须占位输出翻译行，否则音译行会被解析为翻译行
    if (line.translatedLyric || hasRomanWord || line.romanLyric) {
      output.push(`:${escapeWord(line.translatedLyric)}`);
    }
    if (hasRomanWord) {
      output.push(`:${romanWords.join(WORD_SEPARATOR)}`);
      // 主行只有一个单词时，逐字音译无法与单行音译区分，需补出第三行加以区分
      if (line.romanLyric || mainWords.length === 1) {
        output.push(`:${escapeWord(line.romanLyric)}`);
      }
    } else if (line.romanLyric) {
      output.push(`:${escapeWord(line.romanLyric)}`);
    }
  }
  return output.join("\n");
};

/** 解析出的一句歌词 */
interface PlainTextEntry {
  /** 主行在文本中的行号（从 1 开始） */
  lineNumber: number;
  /** 是否为空行（表示删除该行） */
  isBlank: boolean;
  isBG: boolean;
  isDuet: boolean;
  /** 主行单词列表，空字符串表示空白单词 */
  words: string[];
  /** 紧跟主行的 `:` 附加行（已按 `|` 拆分） */
  extras: string[][];
  /** 各附加行在文本中的行号 */
  extraLineNumbers: number[];
}

/**
 * 将纯文本拆分为歌词句
 */
const parseEntries = (content: string): PlainTextEntry[] => {
  const entries: PlainTextEntry[] = [];
  content.split(/\r?\n/).forEach((rawLine, index) => {
    const lineNumber = index + 1;
    // 空行：占位表示删除该行
    if (!rawLine.trim()) {
      entries.push({
        lineNumber,
        isBlank: true,
        isBG: false,
        isDuet: false,
        words: [],
        extras: [],
        extraLineNumbers: [],
      });
      return;
    }
    // 翻译 / 音译行
    if (rawLine.startsWith(":")) {
      const entry = entries[entries.length - 1];
      if (!entry) {
        throw new Error(`第 ${lineNumber} 行：翻译 / 音译行没有对应的主歌词行`);
      }
      entry.extras.push(splitWords(rawLine.slice(1)));
      entry.extraLineNumbers.push(lineNumber);
      return;
    }
    // 主行：解析行首前缀
    let rest = rawLine;
    let isBG = false;
    let isDuet = false;
    while (rest.length) {
      if (rest[0] === "<") {
        isBG = true;
        rest = rest.slice(1);
        continue;
      }
      if (rest[0] === ">") {
        isDuet = true;
        rest = rest.slice(1);
        continue;
      }
      break;
    }
    entries.push({
      lineNumber,
      isBlank: false,
      isBG,
      isDuet,
      words: splitWords(rest),
      extras: [],
      extraLineNumbers: [],
    });
  });
  return entries;
};

/**
 * 解析附加行（翻译 / 音译）
 */
const resolveExtras = (
  entry: PlainTextEntry,
): { translatedLyric: string; romanLyric: string; romanWords: string[] | null } => {
  const [transWords, romanWords, romanLineWords] = entry.extras;
  const lineNumberOf = (extraIndex: number) => entry.extraLineNumbers[extraIndex];

  // 第一行为翻译行，不允许逐字
  let translatedLyric = "";
  if (transWords) {
    if (transWords.length > 1) {
      throw new Error(`第 ${lineNumberOf(0)} 行：翻译行不允许包含逐字歌词`);
    }
    translatedLyric = transWords[0] ?? "";
  }

  // 第二行为音译行，允许单行或逐字
  let romanLyric = "";
  let resolvedRomanWords: string[] | null = null;
  if (romanWords) {
    // 主歌词只有一个单词时无法从内容区分单行与逐字，以是否存在第三行为准
    const isWordLevel =
      romanWords.length > 1 || (entry.words.length === 1 && romanLineWords !== undefined);
    if (isWordLevel) {
      if (romanWords.length !== entry.words.length) {
        throw new Error(
          `第 ${lineNumberOf(1)} 行：逐字音译需与主歌词一一对应（音译 ${romanWords.length} 个，主歌词 ${entry.words.length} 个）`,
        );
      }
      entry.words.forEach((word, index) => {
        if (word === "" && romanWords[index] !== "") {
          throw new Error(
            `第 ${lineNumberOf(1)} 行：主歌词第 ${index + 1} 个为空白单词，逐字音译也必须为空白单词`,
          );
        }
      });
      resolvedRomanWords = romanWords;
      // 第三行表示单行音译，仅在逐字音译时生效
      if (romanLineWords) {
        if (romanLineWords.length > 1) {
          throw new Error(`第 ${lineNumberOf(2)} 行：单行音译行不允许包含逐字歌词`);
        }
        romanLyric = romanLineWords[0] ?? "";
      }
    } else {
      romanLyric = romanWords[0] ?? "";
    }
  }
  return { translatedLyric, romanLyric, romanWords: resolvedRomanWords };
};

/**
 * 将纯文本格式转换回 LyricLine 数组
 *
 * 纯文本本身不含时间戳，需要由 `timedLines` 提供。
 * 行数量（含表示删除的空行）与每行去除空白单词后的单词数量必须与 `timedLines` 一一对应，
 * 否则直接报错。
 * @param content 纯文本格式字符串
 * @param timedLines 提供时间戳的 LyricLine 数组
 * @returns LyricLine 数组（已去除空行对应的歌词行）
 * @throws 格式错误或与 `timedLines` 无法一一对应时抛出异常
 */
export const plainTextToLyricLines = (
  content: string,
  timedLines: Readonly<LyricLine[]>,
): LyricLine[] => {
  const entries = parseEntries(content);
  if (entries.length !== timedLines.length) {
    throw new Error(
      `歌词行数不匹配：文本 ${entries.length} 行，原歌词 ${timedLines.length} 行（删除歌词行请将该行留空，而非移除整行）`,
    );
  }
  const result: LyricLine[] = [];
  entries.forEach((entry, index) => {
    // 空行表示删除该行，其附加行一并忽略
    if (entry.isBlank) return;
    const timedLine = timedLines[index];
    const { translatedLyric, romanLyric, romanWords } = resolveExtras(entry);
    // 去除空白单词后必须与原歌词一一对应
    const wordCount = entry.words.filter((word) => word !== "").length;
    if (wordCount !== timedLine.words.length) {
      throw new Error(
        `第 ${entry.lineNumber} 行：单词数量不匹配（文本 ${wordCount} 个，原歌词 ${timedLine.words.length} 个）`,
      );
    }
    // 按顺序填充回时间戳
    let wordIndex = 0;
    const words: LyricWord[] = [];
    entry.words.forEach((text, tokenIndex) => {
      if (text === "") return;
      const word: LyricWord = { ...timedLine.words[wordIndex++], word: text };
      const romanWord = romanWords?.[tokenIndex];
      if (romanWord) word.romanWord = romanWord;
      else delete word.romanWord;
      words.push(word);
    });
    result.push({
      ...timedLine,
      words,
      translatedLyric,
      romanLyric,
      isBG: entry.isBG,
      isDuet: entry.isDuet,
    });
  });
  return result;
};
