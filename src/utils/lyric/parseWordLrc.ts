import { LyricLine, LyricWord } from "@applemusic-like-lyrics/lyric";
import { alignLyricLines } from "@/utils/lyric/lyricParser";

// 简单解析 lrc 后得到的类型

type LrcSegment =
  | { type: "text"; content: string }
  | { type: "time"; brackets: "square" | "angle"; timestamp: number };

type LrcMetadata = Record<string, string>;

// 一些抄过来的正则表达式，我正则全然苦手

const META_TAG_REGEX = /^\[([a-zA-Z][a-zA-Z0-9]*?):(.+)]$/;
const SQUARE_TIME_TAG_REGEX = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d+))?]/;
const ANGLE_TIME_TAG_REGEX = /<(\d{1,3}):(\d{1,2})(?:[.:](\d+))?>/;

/**
 * 解析时间戳为毫秒
 * 使用字符串补齐处理，避免浮点数计算误差
 */
const parseTimeToMs = (min: string, sec: string, ms: string | undefined): number => {
  const minutes = parseInt(min, 10);
  const seconds = parseInt(sec, 10);
  let milliseconds = 0;
  // 补齐到 3 位 (例如 "5" -> "500", "05" -> "050", "1234" -> "123")
  if (ms) {
    const msNormalized = ms.padEnd(3, "0").slice(0, 3);
    milliseconds = parseInt(msNormalized, 10);
  }
  return minutes * 60 * 1000 + seconds * 1000 + milliseconds;
};

/**
 * 获取时间标签括号信息
 * @param char 当前字符
 * @returns 括号类型与闭合符号；非括号返回 null
 */
const getTimeTagBrackets = (
  char: string,
): { brackets: "square" | "angle"; close: string; regex: RegExp } | null => {
  switch (char) {
    case "[":
      return { brackets: "square", close: "]", regex: SQUARE_TIME_TAG_REGEX };
    case "<":
      return { brackets: "angle", close: ">", regex: ANGLE_TIME_TAG_REGEX };
    default:
      return null;
  }
};

/**
 * 简单解析 lrcLine 为 SimpleParsedLrcLine，并将元数据存入 metadata 对象
 */
const parseSimpleLrcLine = (lrcLine: string, metadata?: LrcMetadata): LrcSegment[] => {
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
  const parsedWords: LrcSegment[] = [];
  let parsedIndex = 0;
  let pointerIndex = 0;

  while (true) {
    const pointerChar = lrcLine[pointerIndex];

    // 尝试寻找标签
    const bracketsInfo = getTimeTagBrackets(pointerChar);
    if (bracketsInfo) {
      const { brackets, close, regex } = bracketsInfo;

      const startBracketIndex = pointerIndex;
      const endBracketIndex = lrcLine.indexOf(close, startBracketIndex);

      if (endBracketIndex === -1) {
        // 没有找到闭合符号，继续往下找
        pointerIndex++;
        continue;
      }

      const timeTag = lrcLine.substring(startBracketIndex, endBracketIndex + 1);
      const match = regex.exec(timeTag);

      if (match === null) {
        // 不是合法的时间标签，继续往下找
        pointerIndex++;
        continue;
      }

      // 将标签前的文本加入结果
      if (startBracketIndex > parsedIndex) {
        parsedWords.push({
          type: "text",
          content: lrcLine.substring(parsedIndex, startBracketIndex),
        });
      }
      // 将时间标签加入结果
      parsedWords.push({
        type: "time",
        brackets,
        timestamp: parseTimeToMs(match[1], match[2], match[3]),
      });
      pointerIndex = endBracketIndex;
      parsedIndex = pointerIndex + 1;
    }

    // 行末尾
    if (pointerIndex >= lrcLine.length) {
      if (pointerIndex > parsedIndex) {
        // 将最后剩余的文本加入结果
        parsedWords.push({
          type: "text",
          content: lrcLine.substring(parsedIndex),
        });
      }
      break;
    }
    // 继续往下找
    pointerIndex++;
  }

  return parsedWords;
};

/**
 * 将前面简单解析过的 LrcSegment[] 转换为 LyricLine
 */
const parseLrcLine = (simpleLine: LrcSegment[]): LyricLine | null => {
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
  let tempTime = lineStartTime;
  let tempString = "";

  // 遍历行内元素
  for (const word of simpleLine) {
    switch (word.type) {
      case "text": {
        tempString += word.content;
        break;
      }
      case "time": {
        const tempEnd = word.timestamp;
        if (tempString)
          words.push({
            startTime: tempTime,
            endTime: tempEnd,
            word: tempString,

            romanWord: "",
          });
        tempTime = tempEnd;
        tempString = "";
        break;
      }
    }
  }
  // 行结尾无文本，说明最后一个 word 是时间标签：设置行结束时间
  if (!tempString) {
    lineEndTime = tempTime;
  }
  // 行结尾有文本，说明最后一个 word 是文本：将文本推入数组中
  // 此处只有单行的信息，无法确定行尾 word 和此行的 EndTime
  // 先设置为 Infinity (初始值)，下面 parseLrcLines 会将其更新为下一行的开始时间
  if (tempString) {
    words.push({
      startTime: tempTime,
      endTime: lineEndTime,
      word: tempString,

      romanWord: "",
    });
  }

  return {
    startTime: lineStartTime,
    endTime: lineEndTime,
    words: words,

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
 * 会将 lrcContent 按行分割，
 * 先进行简单解析得到 string 和时间标签的混合数组，
 * 再将每行的混合数组转换为 LyricLine，
 * 最后为没有明确结束时间的行设置结束时间为下一行的开始时间
 */
const parseLrcLines = (lrcContent: string): LyricLine[] => {
  const metadata: LrcMetadata = {};
  const simpleLines = lrcContent
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => parseSimpleLrcLine(line, metadata));

  const metadataOffset = parseInt(metadata.offset ?? "0", 10);
  if (metadataOffset) applyOffset(simpleLines, metadataOffset);

  const parsedLines: LyricLine[] = [];

  // 维护一个数组，存储之前行缺失结束时间的行
  // 这些行开始时间相同，且必定是正在处理的行的前面几行
  let missingEndTimeLines: LyricLine[] = [];

  for (const simpleLine of simpleLines) {
    const line = parseLrcLine(simpleLine);
    if (!line) continue;

    // 尝试填充之前行缺失的结束时间
    if (missingEndTimeLines.length && missingEndTimeLines[0].startTime < line.startTime) {
      // 之前有行缺失结束时间，且开始时间早于当前行，说明之前的行结束了
      // 更新结束时间为当前行开始时间并清空数组
      for (const missingEndTimeLine of missingEndTimeLines) {
        missingEndTimeLine.endTime = line.startTime;

        const lastWordInMissingLine = missingEndTimeLine.words[missingEndTimeLine.words.length - 1];
        if (lastWordInMissingLine.endTime === Infinity) {
          lastWordInMissingLine.endTime = line.startTime;
        }
      }
      missingEndTimeLines = [];
    }

    // 如果行内没有歌词文本，则跳过该行（空白行仍可参与前面的填充结束时间）
    if (line.words.length === 0) continue;

    // 该行没有明确的结束时间
    if (line.endTime === Infinity) {
      if (missingEndTimeLines.length && missingEndTimeLines[0].startTime === line.startTime) {
        missingEndTimeLines.push(line);
      } else {
        missingEndTimeLines = [line];
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
 * @see parseLrcLines
 */
export const parseWordLrc = (lrcContent: string): LyricLine[] => {
  const parsed = parseLrcLines(lrcContent);

  const aligned = alignLyricLines(converted, { skipSort: true });

  return aligned;
};
