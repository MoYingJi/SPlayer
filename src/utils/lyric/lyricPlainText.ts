import type { LyricLine, LyricWord } from "@applemusic-like-lyrics/lyric";

/**
 * 「纯文本」歌词格式（不含任何时间戳）
 *
 * 完整格式约定见 {@link PLAIN_TEXT_GUIDE}
 */

/** 纯文本格式的完整指引，同时作为格式约定的唯一说明（供编辑器展示） */
export const PLAIN_TEXT_GUIDE = `纯文本模式不含时间戳，只能修改文字内容，保存时会按行、按单词一一对应地填回原有的时间戳。

【基本规则】
· 每行一句歌词，行数必须与原歌词一致
· 删除某行：清空该行内容（留下空行），而不是移除整行
· 逐字歌词用 | 分割单词，单词数必须与原歌词一致
· 单词之间存在时间空隙时显示为 ||，其中的空白单词同样计入单词数
· 把单词内容清空即删除该单词；在空白单词处填入内容，该单词则占据整段时间空隙
· 内容中的 | 写作 \\|，\\ 写作 \\\\；内容开头与下列前缀冲突时同样用 \\ 转义

【行首前缀】（紧跟内容，中间无空格）
· < 背景歌词行
· > 对唱歌词行
· ; 拆行
· : 翻译 / 音译行

【拆行】
· 把分割处的 | 换成 ;，并在 ; 前换行，即可把一行拆成两行
· 拆出的行不继承背景 / 对唱标记，需自行补上，如 ;< 或 ;>
· 逐行歌词（整行只有一个单词）也可以拆行，拆出的各行共用原行的开始与结束时间

【翻译与音译】
· 紧跟主行、以 : 开头：第一行为翻译，第二行为音译
· 翻译行不允许逐字
· 音译行可以是整行，也可以逐字（用 | 分割，需与主歌词一一对应；主歌词为空白单词时音译也必须为空白）
· 逐字音译时，可再加第三个 : 行表示整行音译`;

/** 单词分隔符 */
const WORD_SEPARATOR = "|";

/** 需要在行首额外转义的字符 */
const LINE_START_REGEX = /^[<>:;]/;

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

/** 解析出的一段歌词（主行或其拆行） */
interface PlainTextSegment {
  /** 在文本中的行号（从 1 开始） */
  lineNumber: number;
  isBG: boolean;
  isDuet: boolean;
  /** 单词列表，空字符串表示空白单词 */
  words: string[];
  /** 紧跟该行的 `:` 附加行（已按 `|` 拆分） */
  extras: string[][];
  /** 各附加行在文本中的行号 */
  extraLineNumbers: number[];
}

/** 解析出的一句歌词，对应原歌词的一行 */
interface PlainTextEntry {
  /** 主行在文本中的行号（从 1 开始） */
  lineNumber: number;
  /** 是否为空行（表示删除该行） */
  isBlank: boolean;
  /** 拆行后的各段，空行时为空数组 */
  segments: PlainTextSegment[];
}

/**
 * 解析主行 / 拆行的行首前缀
 */
const parsePrefix = (
  rawLine: string,
): { isSplit: boolean; isBG: boolean; isDuet: boolean; rest: string } => {
  let rest = rawLine;
  let isSplit = false;
  let isBG = false;
  let isDuet = false;
  while (rest.length) {
    const char = rest[0];
    if (char === ";") isSplit = true;
    else if (char === "<") isBG = true;
    else if (char === ">") isDuet = true;
    else break;
    rest = rest.slice(1);
  }
  return { isSplit, isBG, isDuet, rest };
};

/**
 * 将纯文本拆分为歌词句
 */
const parseEntries = (content: string): PlainTextEntry[] => {
  const entries: PlainTextEntry[] = [];
  const lastEntry = () => entries[entries.length - 1];
  content.split(/\r?\n/).forEach((rawLine, index) => {
    const lineNumber = index + 1;
    // 空行：占位表示删除该行
    if (!rawLine.trim()) {
      entries.push({ lineNumber, isBlank: true, segments: [] });
      return;
    }
    // 翻译 / 音译行：归属于最近的一段
    if (rawLine.startsWith(":")) {
      const segment = lastEntry()?.segments.at(-1);
      if (!segment) {
        throw new Error(`第 ${lineNumber} 行：翻译 / 音译行没有对应的主歌词行`);
      }
      segment.extras.push(splitWords(rawLine.slice(1)));
      segment.extraLineNumbers.push(lineNumber);
      return;
    }
    const { isSplit, isBG, isDuet, rest } = parsePrefix(rawLine);
    const entry = isSplit ? lastEntry() : undefined;
    if (isSplit && (!entry || entry.isBlank)) {
      throw new Error(`第 ${lineNumber} 行：拆行没有对应的主歌词行`);
    }
    // 拆出的行不继承背景 / 对唱标记，需自行在 `;` 后补上前缀
    const segment: PlainTextSegment = {
      lineNumber,
      isBG,
      isDuet,
      words: splitWords(rest),
      extras: [],
      extraLineNumbers: [],
    };
    if (entry) entry.segments.push(segment);
    else entries.push({ lineNumber, isBlank: false, segments: [segment] });
  });
  return entries;
};

/**
 * 解析附加行（翻译 / 音译）
 */
const resolveExtras = (
  segment: PlainTextSegment,
): { translatedLyric: string; romanLyric: string; romanWords: string[] | null } => {
  const [transWords, romanWords, romanLineWords] = segment.extras;
  const lineNumberOf = (extraIndex: number) => segment.extraLineNumbers[extraIndex];

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
      romanWords.length > 1 || (segment.words.length === 1 && romanLineWords !== undefined);
    if (isWordLevel) {
      if (romanWords.length !== segment.words.length) {
        throw new Error(
          `第 ${lineNumberOf(1)} 行：逐字音译需与主歌词一一对应（音译 ${romanWords.length} 个，主歌词 ${segment.words.length} 个）`,
        );
      }
      segment.words.forEach((word, index) => {
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

/** 原歌词一行中的一个槽位，与纯文本中的一个单词（含空白单词）一一对应 */
interface TimedSlot {
  /** 原单词，空白单词（时间空隙）没有对应的原单词 */
  word?: LyricWord;
  startTime: number;
  endTime: number;
}

/**
 * 将原歌词行展开为槽位列表，与 `lyricLinesToPlainText` 的输出一一对应
 * 单词之间存在时间空隙时插入一个空白槽位，其时间即这段空隙
 */
const toTimedSlots = (timedLine: LyricLine): TimedSlot[] => {
  const slots: TimedSlot[] = [];
  timedLine.words.forEach((word, index) => {
    slots.push({ word, startTime: word.startTime, endTime: word.endTime });
    const nextWord = timedLine.words[index + 1];
    if (nextWord && nextWord.startTime !== word.endTime) {
      slots.push({ startTime: word.endTime, endTime: nextWord.startTime });
    }
  });
  return slots;
};

/**
 * 判断是否为逐行歌词的拆行
 * 逐行歌词整行只有一个槽位，拆出的各段无法分配逐字时间，只能共用原行的时间
 */
const isLineLevelSplit = (entry: PlainTextEntry, slots: TimedSlot[]): boolean => {
  if (slots.length !== 1) return false;
  // 每段只能有一个单词，且至少有一段存在内容
  if (!entry.segments.every((segment) => segment.words.length === 1)) return false;
  return entry.segments.some((segment) => segment.words[0] !== "");
};

/**
 * 将一句歌词的各段（拆行）转换为 LyricLine
 * 时间戳按顺序取自 `timedLine` 展开出的槽位，拆出的行沿用相邻单词的时间
 */
const buildEntryLines = (entry: PlainTextEntry, timedLine: LyricLine): LyricLine[] => {
  const slots = toTimedSlots(timedLine);
  // 单词数量（含空白单词）必须与原歌词一一对应
  const wordCount = entry.segments.reduce((count, segment) => count + segment.words.length, 0);
  // 逐行歌词拆行时单词数量必然多于原歌词，各段共用原行时间
  const isLineSplit = wordCount !== slots.length && isLineLevelSplit(entry, slots);
  if (!isLineSplit && wordCount !== slots.length) {
    throw new Error(
      `第 ${entry.lineNumber} 行：单词数量不匹配（文本 ${wordCount} 个，原歌词 ${slots.length} 个）`,
    );
  }
  // 按顺序填充回时间戳
  let slotIndex = 0;
  const lines: LyricLine[] = [];
  for (const segment of entry.segments) {
    const { translatedLyric, romanLyric, romanWords } = resolveExtras(segment);
    const words: LyricWord[] = [];
    segment.words.forEach((text, tokenIndex) => {
      // 逐行拆行时所有段共用原行的唯一槽位
      const slot = isLineSplit ? slots[0] : slots[slotIndex++];
      // 内容为空表示删除该单词（空白单词保持为空则原样舍去）
      if (text === "") return;
      // 空白槽位被填入内容时，该单词占据整段时间空隙
      const word: LyricWord = slot.word
        ? { ...slot.word, word: text }
        : { word: text, startTime: slot.startTime, endTime: slot.endTime };
      const romanWord = romanWords?.[tokenIndex];
      if (romanWord) word.romanWord = romanWord;
      else delete word.romanWord;
      words.push(word);
    });
    // 无单词的段（如仅有 `;`）直接舍去
    if (!words.length) continue;
    lines.push({
      ...timedLine,
      words,
      startTime: isLineSplit ? timedLine.startTime : words[0].startTime,
      endTime: isLineSplit ? timedLine.endTime : words[words.length - 1].endTime,
      translatedLyric,
      romanLyric,
      isBG: segment.isBG,
      isDuet: segment.isDuet,
    });
  }
  // 首尾保留原行的开始与结束时间
  if (lines.length) {
    lines[0].startTime = timedLine.startTime;
    lines[lines.length - 1].endTime = timedLine.endTime;
  }
  return lines;
};

/**
 * 将纯文本格式转换回 LyricLine 数组
 *
 * 纯文本本身不含时间戳，需要由 `timedLines` 提供。
 * 行数量（含表示删除的空行，不含拆行）与每行的单词数量（含空白单词）必须与 `timedLines`
 * 一一对应，否则直接报错；逐行歌词（原行只有一个单词）拆行时不受单词数量限制，
 * 拆出的各行共用原行的时间。
 * @param content 纯文本格式字符串
 * @param timedLines 提供时间戳的 LyricLine 数组
 * @returns LyricLine 数组（已去除空行对应的歌词行，并展开拆行）
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
    result.push(...buildEntryLines(entry, timedLines[index]));
  });
  return result;
};
