import { LyricLine, LyricWord } from "@applemusic-like-lyrics/lyric";
import { alignLyricLines } from "./lyricParser";

// 简单解析 lrc 后得到的类型

type LrcSegment =
  | { type: "text"; content: string }
  | { type: "time"; brackets: "square" | "angle"; timestamp: number };

type LrcMetadata = Record<string, string>;

// 一些抄过来的正则表达式，我正则全然苦手

const META_TAG_REGEX = /^\[([a-zA-Z][a-zA-Z0-9]*?):(.+)]$/;

/**
 * 获取时间标签括号信息
 * @param char 当前字符
 * @returns 括号类型与闭合符号；非括号返回 null
 */
const getTimeTagBrackets = (
  char: string,
): { brackets: "square" | "angle"; close: string } | null => {
  switch (char) {
    case "[":
      return { brackets: "square", close: "]" };
    case "<":
      return { brackets: "angle", close: ">" };
    default:
      return null;
  }
};

/**
 * 解析时间标签为毫秒
 * @param line 原始行
 * @param startIndex 标签起始索引
 * @param close 标签闭合符号
 * @returns timestamp 为毫秒，endIndex 为标签闭合符号索引；解析失败返回 null
 */
const parseTimeTagAt = (
  line: string,
  startIndex: number,
  close: string,
): { timestamp: number; endIndex: number } | null => {
  let i = startIndex + 1;

  // 解析分（最多允许 3 位数）
  let minutes = 0;
  let minutesDigits = 0;
  while (i < line.length && minutesDigits < 3) {
    const code = line.charCodeAt(i);
    if (code < 48 || code > 57) break;
    minutes = minutes * 10 + (code - 48);
    minutesDigits++;
    i++;
  }
  if (minutesDigits === 0 || line[i] !== ":") return null;
  i++;

  // 解析秒（最多允许 2 位数）
  let seconds = 0;
  let secondsDigits = 0;
  while (i < line.length && secondsDigits < 2) {
    const code = line.charCodeAt(i);
    if (code < 48 || code > 57) break;
    seconds = seconds * 10 + (code - 48);
    secondsDigits++;
    i++;
  }
  if (secondsDigits === 0 || seconds > 60) return null;

  // 解析毫秒（可选）
  let milliseconds = 0;
  let msDigits = 0;
  if (line[i] === "." || line[i] === ":") {
    i++;
    while (i < line.length) {
      const code = line.charCodeAt(i);
      if (code < 48 || code > 57) break;
      // 精确到 3 位数（毫秒），后面直接丢弃
      if (msDigits < 3) {
        milliseconds = milliseconds * 10 + (code - 48);
        msDigits++;
      }
      i++;
    }
    switch (msDigits) {
      case 0:
        // 存在 "." 或 ":" 但没有数字
        return null;
      case 1:
        milliseconds *= 100;
        break;
      case 2:
        milliseconds *= 10;
        break;
      // case 3 无需处理（已经是三位数的毫秒单位），4 位及以上会被直接丢弃
    }
  }

  // 标签必须以闭合符号结尾
  if (line[i] !== close) return null;

  return {
    timestamp: minutes * 60 * 1000 + seconds * 1000 + milliseconds,
    endIndex: i,
  };
};

/**
 * 简单解析 lrcLine 为 LrcSegment，并将元数据存入 metadata 对象
 */
const parseLrcLineToSegment = (lrcLine: string, metadata?: LrcMetadata): LrcSegment[] => {
  lrcLine = lrcLine.trim();
  if (!lrcLine) return [];

  // 尝试匹配元数据
  const matchMetadataLine = META_TAG_REGEX.exec(lrcLine);
  if (matchMetadataLine) {
    if (!metadata) {
      console.warn("未提供 metadata 对象，跳过元数据:", lrcLine);
      return [];
    }

    const key = matchMetadataLine[1].trim().toLowerCase();
    const value = matchMetadataLine[2].trim();
    if (!key || !value) {
      console.warn("无效的元数据行:", lrcLine);
      return [];
    }
    metadata[key] = value;
    return [];
  }

  // 解析歌词行
  const segments: LrcSegment[] = [];
  let nextSegmentStartIndex = 0;
  let cursorIndex = 0;

  while (true) {
    // 获取当前指针字符
    const cursorChar = lrcLine[cursorIndex];

    // 尝试寻找标签
    const bracketsInfo = getTimeTagBrackets(cursorChar);
    if (bracketsInfo) {
      const { brackets, close } = bracketsInfo;
      const startBracketIndex = cursorIndex;
      const parsed = parseTimeTagAt(lrcLine, startBracketIndex, close);

      if (!parsed) {
        // 不是合法的时间标签，继续往下找
        cursorIndex++;
        continue;
      }

      // 将标签前的文本加入结果
      if (startBracketIndex > nextSegmentStartIndex) {
        segments.push({
          type: "text",
          content: lrcLine.substring(nextSegmentStartIndex, startBracketIndex),
        });
      }
      // 将时间标签加入结果
      segments.push({
        type: "time",
        brackets,
        timestamp: parsed.timestamp,
      });
      // 更新指针位置和文本起始位置
      cursorIndex = parsed.endIndex;
      nextSegmentStartIndex = cursorIndex + 1;
    }

    // 行末尾
    if (cursorIndex === lrcLine.length) {
      if (cursorIndex > nextSegmentStartIndex) {
        // 将最后剩余的文本加入结果
        segments.push({
          type: "text",
          content: lrcLine.substring(nextSegmentStartIndex),
        });
      }
      break;
    }

    // 继续往下找
    cursorIndex++;
  }

  return segments;
};

/**
 * 将前面简单解析过的 LrcSegment[] 转换为 LyricLine
 */
const parseLrcSegmentToLyricLine = (simpleLine: LrcSegment[]): LyricLine | null => {
  if (simpleLine.length === 0) {
    console.warn("无法解析空行");
    return null;
  }
  if (simpleLine[0].type !== "time") {
    console.warn("行首非时间标签");
    return null;
  }
  if (simpleLine[0].brackets !== "square") {
    console.warn("行首时间标签非方括号");
    return null;
  }

  const lineStartTime = simpleLine[0].timestamp;
  let lineEndTime = Infinity;

  const words: LyricWord[] = [];

  let previousTagTime = lineStartTime;
  let pendingWordContent = "";

  // 遍历行内元素
  for (const segment of simpleLine) {
    switch (segment.type) {
      case "text": {
        pendingWordContent += segment.content;
        break;
      }
      case "time": {
        const currentTagTime = segment.timestamp;
        if (pendingWordContent) {
          words.push({
            word: pendingWordContent,
            startTime: previousTagTime,
            endTime: currentTagTime,

            romanWord: "",
          });
          pendingWordContent = "";
        }
        previousTagTime = currentTagTime;
        break;
      }
    }
  }

  if (pendingWordContent) {
    // 行结尾有文本，说明最后一个 word 是文本：将文本推入数组中
    // 此处只有单行的信息，无法确定行尾 word 和此行的 EndTime
    // 先设置为 Infinity (初始值)，下面 parseLrcLines 会将其更新为下一行的开始时间
    words.push({
      word: pendingWordContent,
      startTime: previousTagTime,
      endTime: lineEndTime,

      romanWord: "",
    });
  } else {
    // 行结尾无文本，说明最后一个 word 是时间标签：设置行结束时间
    lineEndTime = previousTagTime;
  }

  return {
    words: words,
    startTime: lineStartTime,
    endTime: lineEndTime,

    translatedLyric: "",
    romanLyric: "",
    isBG: false,
    isDuet: false,
  };
};

/**
 * 将 offset 应用到解析结果中
 * @param lrcLines 简单解析得到的 LrcSegment 二维数组
 * @param offset 从元数据中获取的 offset 值，单位为毫秒
 */
const applyOffset = (lrcLines: LrcSegment[][], offset: number) => {
  if (!isFinite(offset)) {
    console.warn("无效的 offset 值:", offset);
    return;
  }

  // 将 offset 应用到所有时间标签上
  for (const line of lrcLines) {
    for (const word of line) {
      if (word.type === "time") {
        const newTime = word.timestamp + offset;
        word.timestamp = Math.max(0, newTime); // 确保时间不为负数
      }
    }
  }
};

/**
 * 解析 lrc 内容为 LyricLine 数组
 *
 * 会将 lrcContent 按行分割，先进行简单解析得到 LrcSegment，
 * 再将每行的混合数组转换为 LyricLine，
 * 最后为没有明确结束时间的行设置结束时间为下一行的开始时间
 */
export const parseWordLrcRaw = (lrcContent: string): LyricLine[] => {
  const metadata: LrcMetadata = {};
  const simpleLines = lrcContent
    .split(/\r?\n/)
    .map((line) => parseLrcLineToSegment(line, metadata))
    .filter((line) => line.length > 0);

  const metadataOffset = parseInt(metadata.offset ?? "0", 10);
  if (metadataOffset) applyOffset(simpleLines, metadataOffset);

  const parsedLines: LyricLine[] = [];

  // 维护一个数组，存储之前行缺失结束时间的行
  // 这些行开始时间相同，且必定是正在处理的行的前面几行
  // 收集这些行，当遇到下一行时，用它的开始时间作为这些行的结束时间
  let pendingEndLines: LyricLine[] = [];

  for (const simpleLine of simpleLines) {
    const line = parseLrcSegmentToLyricLine(simpleLine);
    if (!line) continue;

    // 尝试填充之前行缺失的结束时间
    if (pendingEndLines.length && pendingEndLines[0].startTime < line.startTime) {
      // 之前有行缺失结束时间，且开始时间早于当前行，说明之前的行结束了
      // 更新结束时间为当前行开始时间并清空数组
      for (const pendingLine of pendingEndLines) {
        pendingLine.endTime = line.startTime;

        const lastWordInPendingLine = pendingLine.words[pendingLine.words.length - 1];
        if (lastWordInPendingLine.endTime === Infinity) {
          lastWordInPendingLine.endTime = line.startTime;
        }
      }
      pendingEndLines = [];
    }

    // 如果行内没有歌词文本，则跳过该行（空白行仍可参与前面的填充结束时间）
    if (line.words.length === 0) continue;

    // 该行没有明确的结束时间
    if (line.endTime === Infinity) {
      if (pendingEndLines.length && pendingEndLines[0].startTime === line.startTime) {
        // 如果之前已经有行缺失结束时间，且开始时间与当前行相同，说明它们是同一行的，继续收集
        pendingEndLines.push(line);
      } else {
        pendingEndLines = [line];
      }
    }

    parsedLines.push(line);
  }

  return parsedLines;
};

/**
 * 解析各种各样的 lrc
 *
 * 调用了 parseLrcLines，并对齐了歌词的翻译和音译
 *
 * @param lrcContent lrc 原始内容
 * @see parseWordLrcRaw
 */
export const parseWordLrc = (lrcContent: string): LyricLine[] => {
  const parsed = parseWordLrcRaw(lrcContent);

  const aligned = alignLyricLines(parsed, { skipSort: true, endTime: "ignore" });

  return aligned;
};
