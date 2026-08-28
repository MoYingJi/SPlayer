import { describe, it, assert } from "vitest";
import type { LyricLine, LyricWord } from "@applemusic-like-lyrics/lyric";
import { lyricLinesToPlainText, plainTextToLyricLines } from "./lyricPlainText";

/** 构造逐行歌词行（整行只有一个单词） */
const createLine = (
  content: string,
  startTime = 0,
  endTime = 1000,
  options: Partial<LyricLine> = {},
): LyricLine => ({
  words: [{ word: content, startTime, endTime }],
  translatedLyric: "",
  romanLyric: "",
  startTime,
  endTime,
  isBG: false,
  isDuet: false,
  ...options,
});

/** 构造逐字歌词行，单词以 [内容, 开始时间, 结束时间, 逐字音译?] 描述 */
const createWordLine = (
  words: [string, number, number, string?][],
  options: Partial<LyricLine> = {},
): LyricLine => {
  const lyricWords: LyricWord[] = words.map(([word, startTime, endTime, romanWord]) =>
    romanWord === undefined
      ? { word, startTime, endTime }
      : { word, startTime, endTime, romanWord },
  );
  return {
    words: lyricWords,
    translatedLyric: "",
    romanLyric: "",
    startTime: lyricWords[0].startTime,
    endTime: lyricWords[lyricWords.length - 1].endTime,
    isBG: false,
    isDuet: false,
    ...options,
  };
};

/** 提取便于断言的行摘要 */
const summarize = (lines: LyricLine[]) =>
  lines.map((line) => ({
    text: line.words.map((word) => word.word).join("|"),
    time: [line.startTime, line.endTime],
    translatedLyric: line.translatedLyric,
    isBG: line.isBG,
    isDuet: line.isDuet,
  }));

describe("lyricLinesToPlainText", () => {
  it("逐行歌词每行一句，不含时间戳", () => {
    const lines = [createLine("第一句", 0, 1000), createLine("第二句", 2000, 3000)];

    assert.equal(lyricLinesToPlainText(lines), "第一句\n第二句");
  });

  it("逐字歌词用 | 分割，时间空隙处补出空白单词", () => {
    const line = createWordLine([
      ["怕", 1000, 1200],
      ["你", 1200, 1500],
      ["忘", 2000, 2400],
      ["记", 2400, 2800],
    ]);

    assert.equal(lyricLinesToPlainText([line]), "怕|你||忘|记");
  });

  it("背景与对唱行带上行首前缀", () => {
    const lines = [
      createLine("bg", 0, 100, { isBG: true }),
      createLine("duet", 100, 200, { isDuet: true }),
      createLine("both", 200, 300, { isBG: true, isDuet: true }),
    ];

    assert.equal(lyricLinesToPlainText(lines), "<bg\n>duet\n<>both");
  });

  it("转义内容中的 | 与 \\，以及与行首前缀冲突的内容", () => {
    const lines = [createLine("a|b"), createLine("c\\d"), createLine(";e"), createLine("<f")];

    assert.equal(lyricLinesToPlainText(lines), "a\\|b\nc\\\\d\n\\;e\n\\<f");
  });

  it("只有音译时也占位输出翻译行", () => {
    const line = createLine("君は", 0, 1000, { romanLyric: "kimi wa" });

    assert.equal(lyricLinesToPlainText([line]), "君は\n:\n:kimi wa");
  });
});

describe("lyricLinesToPlainText 的逐字音译", () => {
  it("逐字音译与主歌词同步输出，无单行音译时不补第三行", () => {
    const line = createWordLine([
      ["君", 0, 500, "kimi"],
      ["は", 500, 1000, "wa"],
    ]);

    assert.equal(lyricLinesToPlainText([line]), "君|は\n:\n:kimi|wa");
  });

  it("主行只有一个单词时补出第三行以区分单行音译", () => {
    const line = createWordLine([["君", 0, 1000, "kimi"]]);

    assert.equal(lyricLinesToPlainText([line]), "君\n:\n:kimi\n:");
  });

  it("空白单词处的逐字音译同样留空", () => {
    const line = createWordLine([
      ["君", 0, 500, "kimi"],
      ["は", 1000, 1500, "wa"],
    ]);

    assert.equal(lyricLinesToPlainText([line]), "君||は\n:\n:kimi||wa");
  });
});

describe("plainTextToLyricLines", () => {
  it("原样回转得到完全相同的歌词数据", () => {
    const lines = [
      createWordLine(
        [
          ["怕", 1000, 1200],
          ["你", 1200, 1500],
          ["忘", 2000, 2400],
        ],
        { translatedLyric: "afraid" },
      ),
      createLine("a|b\\c", 3000, 4000, { isBG: true, isDuet: true, romanLyric: "roman" }),
      createWordLine(
        [
          ["君", 5000, 5500, "kimi"],
          ["は", 5500, 6000, "wa"],
        ],
        { translatedLyric: "你", romanLyric: "kimi wa" },
      ),
    ];

    assert.deepEqual(plainTextToLyricLines(lyricLinesToPlainText(lines), lines), lines);
  });

  it("只改文字内容时保留原有时间戳", () => {
    const lines = [
      createWordLine([
        ["怕", 1000, 1200],
        ["你", 1200, 1500],
      ]),
    ];

    assert.deepEqual(plainTextToLyricLines("我|他", lines)[0].words, [
      { word: "我", startTime: 1000, endTime: 1200 },
      { word: "他", startTime: 1200, endTime: 1500 },
    ]);
  });

  it("空行表示删除该行", () => {
    const lines = [createLine("第一句", 0, 1000), createLine("第二句", 1000, 2000)];

    assert.deepEqual(plainTextToLyricLines("\n第二句", lines), [lines[1]]);
  });

  it("清空单词内容即删除该单词", () => {
    const lines = [
      createWordLine([
        ["怕", 1000, 1200],
        ["你", 1200, 1500],
      ]),
    ];

    assert.deepEqual(plainTextToLyricLines("怕|", lines)[0].words, [
      { word: "怕", startTime: 1000, endTime: 1200 },
    ]);
  });

  it("按 CRLF 分行", () => {
    const lines = [createLine("第一句", 0, 1000), createLine("第二句", 1000, 2000)];

    assert.deepEqual(plainTextToLyricLines("第一句\r\n第二句", lines), lines);
  });
});

describe("plainTextToLyricLines 的空白单词", () => {
  /** 君(0-500) 与 は(1000-1500) 之间存在 500-1000 的空隙 */
  const gapLine = () => [
    createWordLine([
      ["君", 0, 500],
      ["は", 1000, 1500],
    ]),
  ];

  it("空白单词计入单词数量校验", () => {
    assert.throws(() => plainTextToLyricLines("君|は", gapLine()), /单词数量不匹配/);
    assert.throws(() => plainTextToLyricLines("君|||は", gapLine()), /单词数量不匹配/);
  });

  it("空白单词填入内容后占据整段时间空隙", () => {
    assert.deepEqual(plainTextToLyricLines("君|さん|は", gapLine())[0].words, [
      { word: "君", startTime: 0, endTime: 500 },
      { word: "さん", startTime: 500, endTime: 1000 },
      { word: "は", startTime: 1000, endTime: 1500 },
    ]);
  });

  it("空白单词可以带上逐字音译", () => {
    const words = plainTextToLyricLines("君|さん|は\n:\n:kimi|san|wa", gapLine())[0].words;

    assert.deepEqual(
      words.map((word) => [word.word, word.romanWord]),
      [
        ["君", "kimi"],
        ["さん", "san"],
        ["は", "wa"],
      ],
    );
  });

  it("保持为空的空白单词照旧舍去", () => {
    assert.equal(plainTextToLyricLines("君||は", gapLine())[0].words.length, 2);
  });
});

describe("plainTextToLyricLines 的拆行", () => {
  const wordLine = () =>
    createWordLine(
      [
        ["怕", 1000, 1200],
        ["你", 1200, 1500],
        ["忘", 2000, 2400],
        ["记", 2400, 2800],
      ],
      { translatedLyric: "afraid" },
    );

  it("按顺序沿用单词时间，首尾保留原行时间", () => {
    // 空隙处的空白单词留在前一段（把 || 中的后一个 | 换成 ;）
    assert.deepEqual(summarize(plainTextToLyricLines("怕|你|\n;忘|记\n:afraid", [wordLine()])), [
      { text: "怕|你", time: [1000, 1500], translatedLyric: "", isBG: false, isDuet: false },
      { text: "忘|记", time: [2000, 2800], translatedLyric: "afraid", isBG: false, isDuet: false },
    ]);
  });

  it("不继承背景与对唱标记", () => {
    const lines = [
      createWordLine(
        [
          ["oh", 100, 500],
          ["yeah", 500, 900],
        ],
        { isBG: true, isDuet: true },
      ),
    ];

    assert.deepEqual(
      plainTextToLyricLines("<>oh\n;yeah", lines).map((line) => [line.isBG, line.isDuet]),
      [
        [true, true],
        [false, false],
      ],
    );
  });

  it("可以为拆出的行单独设置标记", () => {
    const lines = [
      createWordLine([
        ["oh", 100, 500],
        ["yeah", 500, 900],
      ]),
    ];

    assert.deepEqual(
      plainTextToLyricLines("oh\n;<yeah", lines).map((line) => [line.isBG, line.isDuet]),
      [
        [false, false],
        [true, false],
      ],
    );
  });

  it("仅有 ; 的空段会被舍去", () => {
    // 中间的 ; 段只承载空隙处的空白单词，没有内容故舍去
    assert.equal(plainTextToLyricLines("怕|你\n;\n;忘|记", [wordLine()]).length, 2);
  });
});

describe("plainTextToLyricLines 的逐行歌词拆行", () => {
  const lineLevel = () => [createLine("怕你忘记我", 1000, 3000, { translatedLyric: "afraid" })];

  it("拆出的各行共用原行的开始与结束时间", () => {
    assert.deepEqual(summarize(plainTextToLyricLines("怕你\n;忘记我\n:afraid", lineLevel())), [
      { text: "怕你", time: [1000, 3000], translatedLyric: "", isBG: false, isDuet: false },
      { text: "忘记我", time: [1000, 3000], translatedLyric: "afraid", isBG: false, isDuet: false },
    ]);
  });

  it("拆出的单词也沿用原行的时间", () => {
    assert.deepEqual(plainTextToLyricLines("怕你\n;忘记我", lineLevel())[1].words, [
      { word: "忘记我", startTime: 1000, endTime: 3000 },
    ]);
  });

  it("拆行时不允许引入逐字", () => {
    assert.throws(() => plainTextToLyricLines("怕|你\n;忘记我", lineLevel()), /单词数量不匹配/);
  });

  it("整行没有内容时仍然报错", () => {
    assert.throws(() => plainTextToLyricLines("|", lineLevel()), /单词数量不匹配/);
  });
});

describe("plainTextToLyricLines 的校验", () => {
  const twoWords = () => [
    createWordLine([
      ["君", 0, 500],
      ["は", 500, 1000],
    ]),
  ];

  it("行数不匹配时报错", () => {
    const lines = [createLine("第一句", 0, 1000), createLine("第二句", 1000, 2000)];

    assert.throws(() => plainTextToLyricLines("第二句", lines), /歌词行数不匹配/);
  });

  it("单词数不匹配时报错", () => {
    assert.throws(() => plainTextToLyricLines("君", twoWords()), /单词数量不匹配/);
  });

  it("拆行没有对应主歌词行时报错", () => {
    assert.throws(() => plainTextToLyricLines(";君|は", twoWords()), /拆行没有对应的主歌词行/);
    assert.throws(() => plainTextToLyricLines("\n;君|は", twoWords()), /拆行没有对应的主歌词行/);
  });

  it("翻译 / 音译行没有对应主歌词行时报错", () => {
    assert.throws(
      () => plainTextToLyricLines(":afraid", twoWords()),
      /翻译 \/ 音译行没有对应的主歌词行/,
    );
  });

  it("翻译行不允许逐字", () => {
    assert.throws(
      () => plainTextToLyricLines("君|は\n:a|b", twoWords()),
      /翻译行不允许包含逐字歌词/,
    );
  });

  it("逐字音译需与主歌词一一对应", () => {
    assert.throws(
      () => plainTextToLyricLines("君|は\n:\n:ki|mi|wa", twoWords()),
      /逐字音译需与主歌词一一对应/,
    );
  });

  it("主歌词为空白单词时逐字音译也必须为空白", () => {
    const lines = [
      createWordLine([
        ["君", 0, 500],
        ["は", 1000, 1500],
      ]),
    ];

    assert.throws(
      () => plainTextToLyricLines("君||は\n:\n:kimi|x|wa", lines),
      /逐字音译也必须为空白单词/,
    );
  });
});
