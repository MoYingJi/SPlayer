import type { LyricLine, LyricWord } from "@applemusic-like-lyrics/lyric";

/**
 * 「纯文本」歌词格式（不含绝对时间戳）
 *
 * 完整格式约定见 {@link PLAIN_TEXT_GUIDE}
 */

/** 纯文本格式的完整指引，同时作为格式约定的唯一说明（供编辑器展示） */
export const PLAIN_TEXT_GUIDE = `纯文本模式不含绝对时间戳，只关注歌词内容。保存时按行、按单词一一对应地填回原有的时间戳，对应不上时直接报错。
编辑过程中可以点击「整理」按当前内容重新生成规范格式，拆行、拼接行之后尤其有用。

【时间戳与单词】
· | 代表一个时间戳，单词写在相邻的两个 | 之间
· 相邻的相同时间戳已经合并，所以单词之间通常只有一个 |
· || 中间的空白单词代表一段时间空隙，它同样占一个单词位
· 行首 / 行尾的 | 代表行时间早于首单词 / 晚于末单词，没有则说明两者相同
· 单词数量（含空白单词）必须与原歌词一致

【修改内容】
· 改写单词内容即可，时间戳保持不变
· 清空单词内容即删除该单词
· 在空白单词处填入内容，该单词即占据整段时间空隙
· 删除整行：清空该行内容留下空行（不能留下空格），而不是移除整行

【行首前缀】（紧跟内容，中间无空格，顺序不限）
· < 背景歌词行
· > 对唱歌词行
· ; 拆行

【翻译与音译】（紧跟主行，前缀前后允许空格，各只能出现一次）
· :t: 翻译
· :r: 整行音译
· :r: |xx|xx| 逐字音译，需以 | 开头与结尾，中间与主歌词一一对应
· 主歌词为空白单词或特殊单词的位置，逐字音译也必须留空
· :x: 本格式无法处理的额外信息，删掉即抹除对应信息

【拆行】
· 把分割处的 | 换成 ;，并在 ; 前换行，即可把一行拆成两行
· 拆出的行不继承任何附加信息，背景 / 对唱需自行补上，如 ;< 或 ;>
· 连续的 ;; 等价于中间夹一个空白行，用于把 || 拆成两行
· 空白行会被舍去，因此把行首 / 行尾的 | 换成换行加 ;，可使行时间对齐到单词时间
· 逐行歌词（整行一个单词且时间与行相同）也可以拆行，拆出的各行共用原行时间

【并词】
· 单词写作 -> 表示删掉该单词，并把它的时间合并给前一个单词
· 单词写作 <- 表示删掉该单词，并把它的时间合并给后一个单词
· 可用来消除空隙，或使单词时间对齐到行时间，如 <-|One! |Stop|->

【拼接行】
· 单词写作 ~ 表示在此处拼接下一行，其位置必须正好是原歌词的行边界
· 后一行的开始时间必须不早于前一行的结束时间
· 与并词合用写作 ~> 或 <~，用来消除拼接处的空隙

【转义】
· 内容中的 | 写作 \\|，\\ 写作 \\\\
· 内容与行首前缀、附加行前缀冲突时同样用 \\ 转义，如 \\< \\; \\:
· 内容恰好等于 -> <- ~ ~> <~ 时用 \\ 转义，如 \\~
· \\ 之后只允许出现 \\ | < > ; : ~ -，其余一律报错`;

/** 单词分隔符，代表一个时间戳 */
const WORD_SEPARATOR = "|";

/** 可以被 `\` 转义的字符 */
const ESCAPABLE_CHARS = new Set(["\\", WORD_SEPARATOR, "<", ">", ";", ":", "~", "-"]);

/** 需要在行首额外转义的字符 */
const LINE_START_REGEX = /^[<>;]/;

/** 附加行（翻译 / 音译 / 额外信息）的前缀 */
const EXTRA_LINE_REGEX = /^[ \t]*:([a-zA-Z]*):[ \t]*/;

/** 行首的 `<-` / `<~` 优先解析为特殊单词，而非背景行前缀 */
const LINE_START_SPECIAL_REGEX = /^<[-~](\||$)/;

/** `:x:` 可以标注的额外信息，当前的 LyricLine / LyricWord 尚无扩展属性，故为空 */
const EXTRA_FEATURES: readonly string[] = [];

/** 特殊单词的行为 */
interface SpecialWord {
  /** 是否在此处拼接原歌词的下一行 */
  isJoin: boolean;
  /** 把该单词占据的时间合并给前一个 / 后一个单词 */
  merge: "prev" | "next" | null;
}

/** 全部特殊单词，内容须精确等于键名（含转义则视为普通单词） */
const SPECIAL_WORDS = new Map<string, SpecialWord>([
  ["->", { isJoin: false, merge: "prev" }],
  ["<-", { isJoin: false, merge: "next" }],
  ["~", { isJoin: true, merge: null }],
  ["~>", { isJoin: true, merge: "prev" }],
  ["<~", { isJoin: true, merge: "next" }],
]);

/**
 * 转义内容中的 `\` 与 `|`
 */
const escapeWord = (text: string): string => text.replace(/[\\|]/g, (char) => `\\${char}`);

/**
 * 内容恰好等于特殊单词时整体转义
 */
const escapeSpecialWord = (text: string): string => (SPECIAL_WORDS.has(text) ? `\\${text}` : text);

/**
 * 内容与行首前缀 / 附加行前缀冲突时额外转义
 */
const escapeLineStart = (text: string): string => {
  if (LINE_START_REGEX.test(text)) return `\\${text}`;
  // 附加行前缀允许前导空格，因此跳过空格后的 : 也需要转义
  const spaces = /^[ \t]*/.exec(text)![0];
  if (text[spaces.length] !== ":") return text;
  return `${spaces}\\${text.slice(spaces.length)}`;
};

/**
 * 反转义，`\` 之后只允许出现本格式定义的特殊字符
 */
const unescapeWord = (text: string, lineNumber: number): string =>
  text.replace(/\\([\s\S]?)/g, (_, char: string) => {
    if (!ESCAPABLE_CHARS.has(char)) {
      throw new Error(
        char
          ? `第 ${lineNumber} 行：无效的转义 \\${char}`
          : `第 ${lineNumber} 行：行末存在多余的转义符 \\`,
      );
    }
    return char;
  });

/**
 * 按未转义的 `|` 拆分，各段保留原有的转义序列
 */
const splitRawWords = (raw: string): string[] => {
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
  return parts;
};

/** 原歌词中的一格时间，与纯文本中的一个单词一一对应 */
interface TimedCell {
  /** 原单词，空白单词（行首尾余量、单词间空隙、拼接行的行边界）没有对应的原单词 */
  word?: LyricWord;
  startTime: number;
  endTime: number;
  /** 是否为 `~` 拼接行处的行边界 */
  isJoin?: boolean;
}

/**
 * 将原歌词行展开为时间格列表，与 `lyricLinesToPlainText` 输出的单词一一对应
 *
 * 行时间与首末单词不一致时补出首末的空白单词，单词之间存在空隙时同样补出空白单词
 */
const toTimedCells = (line: LyricLine): TimedCell[] => {
  const cells: TimedCell[] = [];
  const { words } = line;
  if (!words.length) return cells;
  if (line.startTime !== words[0].startTime) {
    cells.push({ startTime: line.startTime, endTime: words[0].startTime });
  }
  words.forEach((word, index) => {
    cells.push({ word, startTime: word.startTime, endTime: word.endTime });
    const nextWord = words[index + 1];
    if (nextWord && nextWord.startTime !== word.endTime) {
      cells.push({ startTime: word.endTime, endTime: nextWord.startTime });
    }
  });
  const lastWord = words[words.length - 1];
  if (line.endTime !== lastWord.endTime) {
    cells.push({ startTime: lastWord.endTime, endTime: line.endTime });
  }
  return cells;
};

/**
 * 生成附加行
 */
const toExtraLine = (kind: string, content: string): string => ` :${kind}: ${content}`;

/**
 * 将 LyricLine 数组转换为纯文本格式
 * @param lines LyricLine 数组
 * @returns 纯文本格式字符串
 */
export const lyricLinesToPlainText = (lines: Readonly<LyricLine[]>): string => {
  const output: string[] = [];
  for (const line of lines) {
    const cells = toTimedCells(line);
    // 没有单词的行无内容可编辑，输出空行（回填时即视为删除该行）
    if (!cells.length) {
      output.push("");
      continue;
    }
    const words = cells.map((cell) =>
      cell.word ? escapeSpecialWord(escapeWord(cell.word.word)) : "",
    );
    words[0] = escapeLineStart(words[0]);
    const prefix = `${line.isBG ? "<" : ""}${line.isDuet ? ">" : ""}`;
    let text = prefix + words.join(WORD_SEPARATOR);
    // 背景行前缀后紧跟 - / ~ 时会被优先解析为特殊单词，需转义首个字符
    if (LINE_START_SPECIAL_REGEX.test(text)) text = `<\\${text.slice(1)}`;
    output.push(text);
    if (line.translatedLyric) output.push(toExtraLine("t", escapeWord(line.translatedLyric)));
    if (line.romanLyric) output.push(toExtraLine("r", escapeWord(line.romanLyric)));
    // 逐字音译与主行的单词一一对应，以首末 | 与整行音译相区分
    const romanWords = cells.map((cell) => escapeWord(cell.word?.romanWord ?? ""));
    if (romanWords.some((word) => word !== "")) {
      const joined = romanWords.join(WORD_SEPARATOR);
      output.push(toExtraLine("r", `${WORD_SEPARATOR}${joined}${WORD_SEPARATOR}`));
    }
  }
  return output.join("\n");
};

/** 纯文本中的一个单词 */
interface PlainTextWord {
  /** 未反转义的原始内容 */
  raw: string;
  /** 反转义后的内容，空字符串表示空白单词 */
  text: string;
  /** 特殊单词的行为，普通单词为 null */
  special: SpecialWord | null;
}

/** 纯文本中的一个附加行 */
interface PlainTextExtra {
  lineNumber: number;
  /** `t` 翻译、`r` 音译、`x` 额外信息 */
  kind: "t" | "r" | "x";
  /** 未反转义的内容 */
  raw: string;
}

/** 解析出的一段歌词（主行或其拆行） */
interface PlainTextSegment {
  /** 在文本中的行号（从 1 开始） */
  lineNumber: number;
  isBG: boolean;
  isDuet: boolean;
  words: PlainTextWord[];
  /** 紧跟该行的附加行 */
  extras: PlainTextExtra[];
}

/** 解析出的一句歌词，对应原歌词的一行（含 `~` 时对应连续多行） */
interface PlainTextEntry {
  /** 主行在文本中的行号（从 1 开始） */
  lineNumber: number;
  /** 是否由空行产生（其后跟随 `;` 拆行时即为拆出的空白行） */
  fromBlankLine: boolean;
  /** 拆行后的各段 */
  segments: PlainTextSegment[];
}

/**
 * 拆分并解析单词列表
 */
const toPlainTextWords = (raw: string, lineNumber: number): PlainTextWord[] =>
  splitRawWords(raw).map((piece) => ({
    raw: piece,
    text: unescapeWord(piece, lineNumber),
    special: SPECIAL_WORDS.get(piece) ?? null,
  }));

/**
 * 构造空白段（空行，或 `;;` 中间省略的空白行）
 */
const toBlankSegment = (lineNumber: number): PlainTextSegment => ({
  lineNumber,
  isBG: false,
  isDuet: false,
  words: [{ raw: "", text: "", special: null }],
  extras: [],
});

/**
 * 解析主行 / 拆行的行首前缀，`;` 的数量即拆行次数
 *
 * 前缀字符顺序不限，也不要求 `<>` 相邻、`;` 连续（生成时固定输出 `<>;;` 这种规范形式）
 */
const parsePrefix = (
  rawLine: string,
): { isBG: boolean; isDuet: boolean; splitCount: number; rest: string } => {
  let rest = rawLine;
  let isBG = false;
  let isDuet = false;
  let splitCount = 0;
  while (rest.length) {
    // 行首的 <- / <~ 优先解析为特殊单词
    if (LINE_START_SPECIAL_REGEX.test(rest)) break;
    const char = rest[0];
    if (char === "<") isBG = true;
    else if (char === ">") isDuet = true;
    else if (char === ";") splitCount++;
    else break;
    rest = rest.slice(1);
  }
  return { isBG, isDuet, splitCount, rest };
};

/**
 * 将纯文本拆分为歌词句
 */
const parseEntries = (content: string): PlainTextEntry[] => {
  const entries: PlainTextEntry[] = [];
  const lastEntry = () => entries[entries.length - 1];
  content.split(/\r?\n/).forEach((rawLine, index) => {
    const lineNumber = index + 1;
    // 附加行：归属于最近的一段
    const extraMatch = EXTRA_LINE_REGEX.exec(rawLine);
    if (extraMatch) {
      const kind = extraMatch[1];
      if (kind !== "t" && kind !== "r" && kind !== "x") {
        throw new Error(
          `第 ${lineNumber} 行：无法识别的附加行前缀 :${kind}:（翻译 :t:、音译 :r:、额外信息 :x:）`,
        );
      }
      const segment = lastEntry()?.segments.at(-1);
      if (!segment) throw new Error(`第 ${lineNumber} 行：附加行没有对应的主歌词行`);
      segment.extras.push({ lineNumber, kind, raw: rawLine.slice(extraMatch[0].length) });
      return;
    }
    if (/^[ \t]*:/.test(rawLine)) {
      throw new Error(`第 ${lineNumber} 行：行首的 : 需要转义为 \\:`);
    }
    // 空行：占位表示删除该行，其后跟随 `;` 时则是拆出的空白行
    // 只有严格的空行才算，仅含空格的行仍是一个空格单词（否则空格单词无法原样保留）
    if (rawLine === "") {
      entries.push({ lineNumber, fromBlankLine: true, segments: [toBlankSegment(lineNumber)] });
      return;
    }
    const { isBG, isDuet, splitCount, rest } = parsePrefix(rawLine);
    // 拆出的行不继承背景 / 对唱标记，需自行在 `;` 后补上前缀
    const segment: PlainTextSegment = {
      lineNumber,
      isBG,
      isDuet,
      words: toPlainTextWords(rest, lineNumber),
      extras: [],
    };
    if (!splitCount) {
      entries.push({ lineNumber, fromBlankLine: false, segments: [segment] });
      return;
    }
    const entry = lastEntry();
    if (!entry) throw new Error(`第 ${lineNumber} 行：拆行没有对应的主歌词行`);
    // 连续的 `;;` 等价于中间夹一个空白行
    for (let i = 1; i < splitCount; i++) entry.segments.push(toBlankSegment(lineNumber));
    entry.segments.push(segment);
  });
  return entries;
};

/**
 * 统计一句中的 `~`，每个 `~` 都会多拼接原歌词的一行
 */
const countJoins = (entry: PlainTextEntry): number =>
  entry.segments.reduce(
    (count, segment) => count + segment.words.filter((word) => word.special?.isJoin).length,
    0,
  );

/**
 * 是否为「置空即删除」的歌词行（其后没有拆行）
 */
const isDeletedEntry = (entry: PlainTextEntry): boolean =>
  entry.fromBlankLine && entry.segments.length === 1;

/**
 * 依次展开该句对应的原歌词各行，`~` 处补出行边界的空白格
 */
const toEntryCells = (entry: PlainTextEntry, sourceLines: Readonly<LyricLine[]>): TimedCell[] => {
  const cells: TimedCell[] = [];
  sourceLines.forEach((line, index) => {
    if (index > 0) {
      const prevLine = sourceLines[index - 1];
      if (prevLine.endTime > line.startTime) {
        throw new Error(
          `第 ${entry.lineNumber} 行：~ 拼接的后一行开始时间早于前一行的结束时间，无法拼接`,
        );
      }
      cells.push({ startTime: prevLine.endTime, endTime: line.startTime, isJoin: true });
    }
    cells.push(...toTimedCells(line));
  });
  return cells;
};

/**
 * 是否为逐行歌词的拆行
 *
 * 逐行歌词整行只有一格时间，拆出的各段无法分配逐字时间，只能共用原行的时间
 */
const isLineLevelSplit = (entry: PlainTextEntry, cells: TimedCell[]): boolean => {
  if (cells.length !== 1 || !cells[0].word) return false;
  // 每段只能有一个普通单词，且至少有一段存在内容
  if (entry.segments.some((segment) => segment.words.length !== 1)) return false;
  if (entry.segments.some((segment) => segment.words[0].special)) return false;
  return entry.segments.some((segment) => segment.words[0].text !== "");
};

/** 一段歌词的附加信息 */
interface ResolvedExtras {
  translatedLyric: string;
  romanLyric: string;
  /** 逐字音译，与该段的单词一一对应，没有则为 null */
  romanWords: string[] | null;
}

/**
 * 校验并反转义逐字音译，需与该段的单词一一对应
 */
const resolveRomanWords = (
  segment: PlainTextSegment,
  parts: string[],
  lineNumber: number,
): string[] => {
  if (parts.length !== segment.words.length) {
    throw new Error(
      `第 ${lineNumber} 行：逐字音译需与主歌词一一对应（音译 ${parts.length} 个，主歌词 ${segment.words.length} 个）`,
    );
  }
  segment.words.forEach((word, index) => {
    if ((word.text !== "" && !word.special) || parts[index] === "") return;
    throw new Error(
      `第 ${lineNumber} 行：主歌词第 ${index + 1} 个是空白单词或特殊单词，逐字音译也必须留空`,
    );
  });
  return parts.map((part) => unescapeWord(part, lineNumber));
};

/**
 * 解析一段歌词的附加行（翻译 / 音译 / 额外信息）
 */
const resolveExtras = (segment: PlainTextSegment): ResolvedExtras => {
  let translatedLyric = "";
  let romanLyric = "";
  let romanWords: string[] | null = null;
  let hasTranslated = false;
  let hasRomanLine = false;
  for (const { lineNumber, kind, raw } of segment.extras) {
    // 额外信息本身原样保留，此处只校验名称，删除该行即抹除对应信息
    if (kind === "x") {
      for (const name of raw.split(/\s+/).filter(Boolean)) {
        if (!EXTRA_FEATURES.includes(name)) {
          throw new Error(`第 ${lineNumber} 行：不支持的额外信息「${name}」，请删除`);
        }
      }
      continue;
    }
    const parts = splitRawWords(raw);
    // 翻译行不允许逐字
    if (kind === "t") {
      if (hasTranslated) throw new Error(`第 ${lineNumber} 行：翻译行只能出现一次`);
      hasTranslated = true;
      if (parts.length > 1) throw new Error(`第 ${lineNumber} 行：翻译行不允许包含逐字歌词`);
      translatedLyric = unescapeWord(raw, lineNumber);
      continue;
    }
    // 逐字音译以首末 | 与整行音译相区分
    if (parts.length > 1 && parts[0] === "") {
      if (parts[parts.length - 1] !== "") {
        throw new Error(`第 ${lineNumber} 行：逐字音译需要以 | 开头与结尾`);
      }
      if (romanWords) throw new Error(`第 ${lineNumber} 行：逐字音译只能出现一次`);
      romanWords = resolveRomanWords(segment, parts.slice(1, -1), lineNumber);
      continue;
    }
    if (parts.length > 1) {
      throw new Error(`第 ${lineNumber} 行：整行音译中的 | 需要转义为 \\|`);
    }
    if (hasRomanLine) throw new Error(`第 ${lineNumber} 行：整行音译只能出现一次`);
    hasRomanLine = true;
    romanLyric = unescapeWord(raw, lineNumber);
  }
  return { translatedLyric, romanLyric, romanWords };
};

/**
 * 处理 `->` / `~>`：把该单词占据的时间合并给前一个单词
 */
const applyMergePrev = (
  segment: PlainTextSegment,
  word: PlainTextWord,
  cell: TimedCell,
  words: LyricWord[],
): void => {
  if (word.special?.merge !== "prev") return;
  const prevWord = words[words.length - 1];
  if (!prevWord) {
    throw new Error(`第 ${segment.lineNumber} 行：${word.raw} 前面没有可以合并的单词`);
  }
  prevWord.endTime = cell.endTime;
};

/**
 * 校验特殊单词与原歌词的行边界是否对应
 */
const checkJoinCell = (segment: PlainTextSegment, word: PlainTextWord, cell: TimedCell): void => {
  if (!!word.special?.isJoin === !!cell.isJoin) return;
  throw new Error(
    cell.isJoin
      ? `第 ${segment.lineNumber} 行：原歌词的行边界处必须是 ~ 拼接单词`
      : `第 ${segment.lineNumber} 行：${word.raw} 的位置不是原歌词的行边界，无法拼接行`,
  );
};

/**
 * 将一句歌词的各段（拆行）转换为 LyricLine
 *
 * 时间戳按顺序取自各原歌词行展开出的时间格，每段的始末时间即其首末时间格的边界
 */
const buildEntryLines = (
  entry: PlainTextEntry,
  sourceLines: Readonly<LyricLine[]>,
): LyricLine[] => {
  const cells = toEntryCells(entry, sourceLines);
  // 单词数量（含空白单词与特殊单词）必须与原歌词一一对应
  const wordCount = entry.segments.reduce((count, segment) => count + segment.words.length, 0);
  // 逐行歌词拆行时单词数量必然多于原歌词，各段共用原行时间
  const isLineSplit = wordCount !== cells.length && isLineLevelSplit(entry, cells);
  if (!isLineSplit && wordCount !== cells.length) {
    throw new Error(
      `第 ${entry.lineNumber} 行：单词数量不匹配（文本 ${wordCount} 个，原歌词 ${cells.length} 个）`,
    );
  }
  const lines: LyricLine[] = [];
  let cellIndex = 0;
  for (const segment of entry.segments) {
    const extras = resolveExtras(segment);
    const firstCell = isLineSplit ? cells[0] : cells[cellIndex];
    const words: LyricWord[] = [];
    /** 等待与后一个单词合并的时间格 */
    let mergeNext: { cell: TimedCell; raw: string } | null = null;
    for (const [index, word] of segment.words.entries()) {
      const cell = isLineSplit ? cells[0] : cells[cellIndex++];
      checkJoinCell(segment, word, cell);
      if (word.special) {
        applyMergePrev(segment, word, cell, words);
        if (word.special.merge === "next") mergeNext ??= { cell, raw: word.raw };
        continue;
      }
      // 内容为空表示删除该单词（空白单词保持为空则原样舍去）
      if (word.text === "") continue;
      // 空白格被填入内容时，该单词占据整格时间
      const built: LyricWord = cell.word
        ? { ...cell.word, word: word.text }
        : { word: word.text, startTime: cell.startTime, endTime: cell.endTime };
      if (mergeNext) {
        built.startTime = mergeNext.cell.startTime;
        mergeNext = null;
      }
      const romanWord = extras.romanWords?.[index];
      if (romanWord) built.romanWord = romanWord;
      else delete built.romanWord;
      words.push(built);
    }
    if (mergeNext) {
      throw new Error(`第 ${segment.lineNumber} 行：${mergeNext.raw} 后面没有可以合并的单词`);
    }
    // 没有单词的段（如仅有 `;` 的空白行）直接舍去
    if (!words.length) continue;
    lines.push({
      ...sourceLines[0],
      words,
      startTime: firstCell.startTime,
      endTime: (isLineSplit ? cells[0] : cells[cellIndex - 1]).endTime,
      translatedLyric: extras.translatedLyric,
      romanLyric: extras.romanLyric,
      isBG: segment.isBG,
      isDuet: segment.isDuet,
    });
  }
  return lines;
};

/**
 * 将纯文本格式转换回 LyricLine 数组
 *
 * 时间戳全部取自 `timedLines`，因此文本必须与之逐行、逐单词地一一对应，对应不上时直接报错
 *
 * @param content 纯文本内容
 * @param timedLines 生成该纯文本的原歌词，提供全部时间戳
 * @returns LyricLine 数组
 */
export const plainTextToLyricLines = (
  content: string,
  timedLines: Readonly<LyricLine[]>,
): LyricLine[] => {
  const entries = parseEntries(content);
  // 每个 `~` 都会多消耗原歌词的一行
  const consumed = entries.map((entry) => 1 + countJoins(entry));
  const total = consumed.reduce((count, value) => count + value, 0);
  if (total !== timedLines.length) {
    throw new Error(
      `歌词行数不匹配：文本 ${total} 行（含 ~ 拼接的行），原歌词 ${timedLines.length} 行（删除歌词行请将该行留空，而非移除整行）`,
    );
  }
  const result: LyricLine[] = [];
  let lineIndex = 0;
  entries.forEach((entry, index) => {
    const sourceLines = timedLines.slice(lineIndex, lineIndex + consumed[index]);
    lineIndex += consumed[index];
    // 置空的行即删除，无需校验单词数量
    if (isDeletedEntry(entry)) return;
    result.push(...buildEntryLines(entry, sourceLines));
  });
  return result;
};
