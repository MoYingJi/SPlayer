import { LyricLine } from "@applemusic-like-lyrics/lyric";
import { alignLyricLines } from "@/utils/lyric/lyricParser";

// 定义 LyricLine 和 LyricWord 的子集，方便一点

interface LrcWord {
  startTime: number;
  endTime: number;
  word: string;
}
interface LrcLine {
  startTime: number;
  endTime: number;
  words: LrcWord[];
}

// 定义简单的时间标签接口，方便解析

interface SimpleLrcTimeTag {
  brackets: "square" | "angle";
  milliseconds: number;
}
interface SimpleLrcMetadataLine {
  key: string;
  value: string;
}
type SimpleParsedLrcWord = string | SimpleLrcTimeTag;
type SimpleParsedLrcLine = SimpleParsedLrcWord[] | SimpleLrcMetadataLine;

// 一些抄过来的正则表达式，我正则全然苦手

const META_TAG_REGEX = /^\[([a-zA-Z][a-zA-Z0-9]*?]):(.+)]?$/;
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
 * 简单解析 lrcLine 为 string 或时间标签
 */
const parseSimpleLrcLine = (lrcLine: string): SimpleParsedLrcLine => {
  lrcLine = lrcLine.trim();
  if (!lrcLine) return [];

  const matchMetaLine = META_TAG_REGEX.exec(lrcLine);
  if (matchMetaLine) {
    const key = matchMetaLine[1].toLowerCase();
    const value = matchMetaLine[2].trim();
    if (!key || !value) {
      console.warn("无效的元数据行:", lrcLine);
      return [];
    }
    return {
      key: matchMetaLine[1],
      value: matchMetaLine[2],
    };
  }

  const parsedWords: SimpleParsedLrcWord[] = [];
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
        parsedWords.push(lrcLine.substring(parsedIndex, startBracketIndex));
      }
      // 将时间标签加入结果
      parsedWords.push({
        brackets,
        milliseconds: parseTimeToMs(match[1], match[2], match[3]),
      });
      pointerIndex = endBracketIndex;
      parsedIndex = pointerIndex + 1;
    }

    // 行末尾
    if (pointerIndex >= lrcLine.length) {
      if (pointerIndex > parsedIndex) parsedWords.push(lrcLine.substring(parsedIndex));
      break;
    }
    // 继续往下找
    pointerIndex++;
  }

  return parsedWords;
};

/**
 * 处理 SimpleParsedLrcLine 中的元数据行，转换为仅含有 SimpleParsedLrcWord 的歌词
 */
const processMetadata = (lrcLines: SimpleParsedLrcLine[]): SimpleParsedLrcWord[][] => {
  const metadata: Record<string, string> = {};
  const processedLines: SimpleParsedLrcWord[][] = [];

  for (const line of lrcLines) {
    if ("key" in line && "value" in line) {
      metadata[line.key] = line.value;
    } else if (Array.isArray(line)) {
      processedLines.push(line);
    } else {
      console.warn("未知的行类型，跳过:", line);
    }
  }

  if (metadata.offset) {
    const offsetMs = parseInt(metadata.offset, 10);
    if (offsetMs === 0) {
      /* offset 为 0 不应用 */
    } else if (!isFinite(offsetMs)) {
      console.warn("无效的 offset 值:", metadata.offset);
    } else {
      // 将 offset 应用到所有时间标签上
      for (const line of processedLines) {
        for (const word of line) {
          if (typeof word !== "string") {
            const newTime = word.milliseconds + offsetMs;
            word.milliseconds = Math.max(0, newTime); // 确保时间不为负数
          }
        }
      }
    }
  }

  return processedLines;
}

/**
 * 将前面简单解析过的 string 和时间标签转换为 LrcLine
 */
const parseLrcLine = (simpleLine: SimpleParsedLrcWord[]): LrcLine | null => {
  if (simpleLine.length === 0) {
    console.warn("无法解析空行");
    return null;
  }
  if (typeof simpleLine[0] === "string") {
    console.warn("行首非时间标签");
    return null;
  }
  if (simpleLine[0].brackets !== "square") {
    console.warn("行首时间标签非方括号");
    return null;
  }

  const lineStartTime = (simpleLine[0] as SimpleLrcTimeTag).milliseconds;
  let lineEndTime = Infinity;

  const words: LrcWord[] = [];
  let tempTime = lineStartTime;
  let tempString = "";

  // 遍历行内元素
  for (const word of simpleLine) {
    if (typeof word === "string") {
      tempString += word;
    } else {
      // 时间标签
      const tempEnd = word.milliseconds;
      if (tempString)
        words.push({
          startTime: tempTime,
          endTime: tempEnd,
          word: tempString,
        });
      tempTime = tempEnd;
      tempString = "";
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
    });
  }

  return {
    startTime: lineStartTime,
    endTime: lineEndTime,
    words,
  };
};

/**
 * 解析 lrc 内容为 LrcLine 数组
 *
 * 会将 lrcContent 按行分割，
 * 先进行简单解析得到 string 和时间标签的混合数组，
 * 再将每行的混合数组转换为 LrcLine，
 * 最后为没有明确结束时间的行设置结束时间为下一行的开始时间
 */
const parseLrcLines = (lrcContent: string): LrcLine[] => {
  const parsedSimpleLines = lrcContent
    .split(/\r?\n/)
    .map(parseSimpleLrcLine)
  const simpleLines = processMetadata(parsedSimpleLines)
    .filter((line) => line.length > 0);

  const parsedLines: LrcLine[] = [];

  for (const simpleLine of simpleLines) {
    const line = parseLrcLine(simpleLine);
    if (!line) continue;
    // 如果前面的行没有明确的结束时间 (Infinity)，则将其结束时间设置为当前行的开始时间
    let i = parsedLines.length - 1;
    // 先跳过所有开始时间大于等于当前行的行（考虑 line 为译文，prev 为主行）
    for (; i >= 0; i--) {
      const prev = parsedLines[i];
      if (prev.startTime < line.startTime) break;
    }
    // 设置结束时间为当前行开始时间，直到遇见一个已经有明确结束时间的行
    for (; i >= 0; i--) {
      const prev = parsedLines[i];
      if (prev.endTime !== Infinity) break;
      prev.endTime = line.startTime;
      prev.words[prev.words.length - 1].endTime = line.startTime;
    }

    // 如果行内没有歌词文本，则跳过该行（空白行仍可参与前面的填充结束时间）
    if (line.words.length === 0) continue;

    parsedLines.push(line);
  }

  return parsedLines;
};

/**
 * 解析各种各样的 lrc
 *
 * 调用了 parseLrcLines，将其转为 AMLL 支持的 LyricLine 结构，并对齐了歌词的翻译和音译
 *
 * @param lrcContent lrc 原始内容
 * @see parseLrcLines
 */
export const parseWordLrc = (lrcContent: string): LyricLine[] => {
  const lrcLines = parseLrcLines(lrcContent);

  const converted = lrcLines.map((line) => ({
    startTime: line.startTime,
    endTime: line.endTime,
    romanLyric: "",
    translatedLyric: "",
    isBG: false,
    isDuet: false,
    words: line.words.map((word) => ({
      startTime: word.startTime,
      endTime: word.endTime,
      word: word.word,
      romanWord: "",
      translatedWord: "",
    })),
  }));

  const aligned = alignLyricLines(converted, { skipSort: true });

  return aligned;
};
