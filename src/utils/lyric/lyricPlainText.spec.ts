import { describe, it, assert } from "vitest";
import type { LyricLine, LyricWord } from "@applemusic-like-lyrics/lyric";
import { lyricLinesToPlainText, plainTextToLyricLines } from "./lyricPlainText";

/** 构造逐行歌词行（整行只有一个单词，且时间与行相同） */
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

/** 生成纯文本后原样回填 */
const roundTrip = (lines: LyricLine[]): LyricLine[] =>
  plainTextToLyricLines(lyricLinesToPlainText(lines), lines);

describe("lyricLinesToPlainText", () => {
  it("逐行歌词只有一个单词，不生成始末 |", () => {
    assert.equal(lyricLinesToPlainText([createLine("君は")]), "君は");
  });

  it("逐字歌词以 | 分隔，单词之间的空隙生成空白单词", () => {
    const line = createWordLine([
      ["One! ", 0, 500],
      ["Stop ", 800, 1000],
      ["staying", 1000, 1200],
    ]);
    assert.equal(lyricLinesToPlainText([line]), "One! ||Stop |staying");
  });

  it("行时间早于首单词或晚于末单词时生成始末 |", () => {
    const line = createWordLine(
      [
        ["ab", 1, 2],
        ["cd", 2, 3],
      ],
      { startTime: 0, endTime: 4 },
    );
    assert.equal(lyricLinesToPlainText([line]), "|ab|cd|");
  });

  it("背景与对唱行生成 <> 前缀", () => {
    const line = createLine("Oh yeah", 0, 100, { isBG: true, isDuet: true });
    assert.equal(lyricLinesToPlainText([line]), "<>Oh yeah");
  });

  it("翻译、整行音译、逐字音译生成独立的附加行", () => {
    const line = createWordLine(
      [
        ["深", 0, 100, "fu"],
        ["く", 100, 200, "ka"],
      ],
      { translatedLyric: "深红", romanLyric: "fu ka" },
    );
    assert.equal(
      lyricLinesToPlainText([line]),
      ["深|く", " :t: 深红", " :r: fu ka", " :r: |fu|ka|"].join("\n"),
    );
  });
});

describe("lyricLinesToPlainText 转义", () => {
  it("转义内容中的 | 与 \\，以及恰好等于特殊单词的内容", () => {
    const line = createWordLine([
      ["a|b", 0, 100],
      ["c\\d", 100, 200],
      ["->", 200, 300],
    ]);
    assert.equal(lyricLinesToPlainText([line]), "a\\|b|c\\\\d|\\->");
  });

  it("首个单词与行首前缀、附加行前缀冲突时额外转义", () => {
    assert.equal(lyricLinesToPlainText([createLine("<hi")]), "\\<hi");
    assert.equal(lyricLinesToPlainText([createLine(" :t: hi")]), " \\:t: hi");
  });

  it("背景行的首个单词以 - 开头时转义，避免与 <- 混淆", () => {
    const line = createWordLine(
      [
        ["-", 0, 100],
        ["b", 100, 200],
      ],
      { isBG: true },
    );
    assert.equal(lyricLinesToPlainText([line]), "<\\-|b");
  });

  it("没有单词的行输出空行", () => {
    const empty = { ...createLine("x"), words: [] };
    assert.equal(lyricLinesToPlainText([createLine("a", 0, 100), empty]), "a\n");
  });
});

describe("纯文本往返", () => {
  it("逐字歌词、翻译、音译、背景对唱往返一致", () => {
    const lines = [
      createWordLine(
        [
          ["深", 0, 100, "fu"],
          ["く", 100, 200, "ka"],
        ],
        { translatedLyric: "深红", romanLyric: "fu ka" },
      ),
      createWordLine(
        [
          ["ab", 300, 400],
          ["cd", 500, 600],
        ],
        { startTime: 250, endTime: 700, isBG: true, isDuet: true },
      ),
      createLine("君は", 800, 900),
    ];
    assert.deepEqual(roundTrip(lines), lines);
  });

  it("含特殊字符的内容往返一致", () => {
    const lines = [
      createWordLine([
        ["a|b", 0, 100],
        ["c\\d", 100, 200],
        ["->", 200, 300],
        ["~", 300, 400],
      ]),
      createLine("<hi", 500, 600),
      createLine(" :t: hi", 700, 800),
      createWordLine([["-", 900, 1000]], { isBG: true }),
    ];
    assert.deepEqual(roundTrip(lines), lines);
  });

  it("仅含空格的单词不会被当作空行删除", () => {
    const lines = [createLine(" ", 0, 100)];
    assert.deepEqual(roundTrip(lines), lines);
  });

  it("没有单词的行在回填时被删除", () => {
    const kept = createLine("a", 0, 100);
    const empty = { ...createLine("x"), words: [] };
    assert.deepEqual(roundTrip([kept, empty]), [kept]);
  });
});

describe("plainTextToLyricLines 编辑内容", () => {
  it("改写单词内容时保持原有时间戳", () => {
    const base = [
      createWordLine([
        ["ab", 1, 2],
        ["cd", 2, 3],
      ]),
    ];
    assert.deepEqual(plainTextToLyricLines("AB|CD", base), [
      createWordLine([
        ["AB", 1, 2],
        ["CD", 2, 3],
      ]),
    ]);
  });

  it("清空单词内容即删除该单词", () => {
    const base = [
      createWordLine([
        ["ab", 1, 2],
        ["cd", 2, 3],
      ]),
    ];
    assert.deepEqual(plainTextToLyricLines("|cd", base), [
      createWordLine([["cd", 2, 3]], { startTime: 1, endTime: 3 }),
    ]);
  });

  it("在空白单词处填入内容后该单词占据整段空隙", () => {
    const base = [
      createWordLine([
        ["One! ", 0, 500],
        ["Stop", 800, 1000],
      ]),
    ];
    assert.deepEqual(plainTextToLyricLines("One! |gap|Stop", base), [
      createWordLine([
        ["One! ", 0, 500],
        ["gap", 500, 800],
        ["Stop", 800, 1000],
      ]),
    ]);
  });

  it("留下空行即删除该行", () => {
    const base = [createLine("a", 0, 100), createLine("b", 100, 200)];
    assert.deepEqual(plainTextToLyricLines("\nb", base), [createLine("b", 100, 200)]);
  });

  it("删除逐字音译行即抹除逐字音译", () => {
    const base = [
      createWordLine([
        ["深", 0, 100, "fu"],
        ["く", 100, 200, "ka"],
      ]),
    ];
    assert.deepEqual(plainTextToLyricLines("深|く", base), [
      createWordLine([
        ["深", 0, 100],
        ["く", 100, 200],
      ]),
    ]);
  });

  it("行首前缀顺序不限", () => {
    const base = [createLine("hi", 0, 100)];
    assert.deepEqual(plainTextToLyricLines("><hi", base), [
      createLine("hi", 0, 100, { isBG: true, isDuet: true }),
    ]);
  });
});

describe("plainTextToLyricLines 拆行", () => {
  it("把 | 换成换行加 ; 即拆成两行", () => {
    const base = [
      createWordLine([
        ["a", 1, 2],
        ["b", 2, 3],
      ]),
    ];
    assert.deepEqual(plainTextToLyricLines("a\n;b", base), [
      createWordLine([["a", 1, 2]]),
      createWordLine([["b", 2, 3]]),
    ]);
  });

  it("连续的 ;; 等价于中间夹一个空白行，可拆开 ||", () => {
    const base = [
      createWordLine([
        ["x", 0, 100],
        ["y", 300, 400],
      ]),
    ];
    assert.deepEqual(plainTextToLyricLines("x\n;;y", base), [
      createWordLine([["x", 0, 100]]),
      createWordLine([["y", 300, 400]]),
    ]);
  });

  it("拆出的行不继承背景与对唱标记", () => {
    const base = [
      createWordLine(
        [
          ["a", 1, 2],
          ["b", 2, 3],
        ],
        { isBG: true, isDuet: true },
      ),
    ];
    assert.deepEqual(plainTextToLyricLines("<>a\n;b", base), [
      createWordLine([["a", 1, 2]], { isBG: true, isDuet: true }),
      createWordLine([["b", 2, 3]]),
    ]);
  });

  it("把始末 | 换成换行加 ; 可使行时间对齐到单词时间", () => {
    const base = [
      createWordLine(
        [
          ["a", 1, 2],
          ["b", 2, 3],
        ],
        { startTime: 0, endTime: 4 },
      ),
    ];
    assert.deepEqual(plainTextToLyricLines("\n;a|b\n;", base), [
      createWordLine([
        ["a", 1, 2],
        ["b", 2, 3],
      ]),
    ]);
  });

  it("逐行歌词拆行后各行共用原行时间", () => {
    const base = [createLine("abcdefg", 1, 2)];
    assert.deepEqual(plainTextToLyricLines("abcd\n;efg", base), [
      createLine("abcd", 1, 2),
      createLine("efg", 1, 2),
    ]);
  });
});

describe("plainTextToLyricLines 并词", () => {
  const base = () => [
    createWordLine([
      ["ab", 0, 1],
      ["cd", 1, 2],
      ["ef", 2, 3],
    ]),
  ];

  it("-> 把该单词的时间合并给前一个单词", () => {
    assert.deepEqual(plainTextToLyricLines("ab|->|ef", base()), [
      createWordLine([
        ["ab", 0, 2],
        ["ef", 2, 3],
      ]),
    ]);

    assert.deepEqual(plainTextToLyricLines("ab|cd|->", base()), [
      createWordLine([
        ["ab", 0, 1],
        ["cd", 1, 3],
      ]),
    ]);
  });

  it("<- 把该单词的时间合并给后一个单词", () => {
    assert.deepEqual(plainTextToLyricLines("ab|<-|ef", base()), [
      createWordLine([
        ["ab", 0, 1],
        ["ef", 1, 3],
      ]),
    ]);

    assert.deepEqual(plainTextToLyricLines("<-|cd|ef", base()), [
      createWordLine([
        ["cd", 0, 2],
        ["ef", 2, 3],
      ]),
    ]);
  });

  it("行首的 <- 优先解析为特殊单词，可使单词时间对齐到行时间", () => {
    const single = [createWordLine([["One!", 100, 200]], { startTime: 0, endTime: 300 })];
    assert.deepEqual(plainTextToLyricLines("<-|One!|->", single), [
      createWordLine([["One!", 0, 300]]),
    ]);
  });
});

describe("plainTextToLyricLines 拼接行", () => {
  const gapLines = () => [createWordLine([["et, ", 0, 100]]), createWordLine([["pop", 200, 300]])];

  it("~ 在原歌词的行边界处拼接两行", () => {
    const base = [
      createWordLine(
        [
          ["ab", 1, 2],
          ["cd", 2, 3],
        ],
        { startTime: 0, endTime: 4 },
      ),
      createWordLine(
        [
          ["ef", 6, 7],
          ["gh", 7, 8],
        ],
        { startTime: 5, endTime: 9 },
      ),
    ];
    assert.deepEqual(plainTextToLyricLines("|ab|cd||~||ef|gh|", base), [
      createWordLine(
        [
          ["ab", 1, 2],
          ["cd", 2, 3],
          ["ef", 6, 7],
          ["gh", 7, 8],
        ],
        { startTime: 0, endTime: 9 },
      ),
    ]);
  });

  it("<~ 拼接行并把空隙合并给后一个单词", () => {
    assert.deepEqual(plainTextToLyricLines("et, |<~|pop", gapLines()), [
      createWordLine([
        ["et, ", 0, 100],
        ["pop", 100, 300],
      ]),
    ]);
  });

  it("~> 拼接行并把空隙合并给前一个单词", () => {
    assert.deepEqual(plainTextToLyricLines("et, |~>|pop", gapLines()), [
      createWordLine([
        ["et, ", 0, 200],
        ["pop", 200, 300],
      ]),
    ]);
  });
});

describe("plainTextToLyricLines 报错", () => {
  const twoWords = () => [
    createWordLine([
      ["a", 0, 1],
      ["b", 1, 2],
    ]),
  ];
  const joinBase = () => [
    createWordLine([
      ["a", 0, 1],
      ["b", 1, 2],
    ]),
    createLine("c", 2, 3),
  ];

  it("单词数量与原歌词不一致时报错", () => {
    assert.throws(() => plainTextToLyricLines("a", twoWords()), "单词数量不匹配");
  });

  it("歌词行数与原歌词不一致时报错", () => {
    const base = [createLine("a", 0, 100), createLine("b", 100, 200)];
    assert.throws(() => plainTextToLyricLines("a", base), "歌词行数不匹配");
  });

  it("无效的转义与行末多余的转义符报错", () => {
    assert.throws(() => plainTextToLyricLines("a\\ab", [createLine("a")]), "无效的转义");
    assert.throws(() => plainTextToLyricLines("ab\\", [createLine("a")]), "行末存在多余的转义符");
  });

  it("行首未转义的 : 报错", () => {
    assert.throws(() => plainTextToLyricLines(":hi", [createLine("a")]), "行首的 : 需要转义");
  });

  it("无法识别的附加行前缀报错", () => {
    assert.throws(
      () => plainTextToLyricLines("hi\n :q: x", [createLine("a")]),
      "无法识别的附加行前缀",
    );
  });

  it("附加行没有对应的主歌词行时报错", () => {
    assert.throws(
      () => plainTextToLyricLines(" :t: x", [createLine("a")]),
      "附加行没有对应的主歌词行",
    );
  });

  it("翻译行重复出现时报错", () => {
    assert.throws(
      () => plainTextToLyricLines("hi\n :t: a\n :t: b", [createLine("a")]),
      "翻译行只能出现一次",
    );
  });

  it("逐字音译与主歌词数量不一致时报错", () => {
    assert.throws(
      () => plainTextToLyricLines("a|b\n :r: |x|", twoWords()),
      "逐字音译需与主歌词一一对应",
    );
  });

  it("空白单词处的逐字音译必须留空", () => {
    const base = [
      createWordLine([
        ["a", 0, 1],
        ["b", 2, 3],
      ]),
    ];
    assert.throws(() => plainTextToLyricLines("a||b\n :r: |x|y|z|", base), "逐字音译也必须留空");
  });

  it("整行音译中未转义的 | 报错", () => {
    assert.throws(
      () => plainTextToLyricLines("a|b\n :r: x|y", twoWords()),
      "整行音译中的 | 需要转义",
    );
  });

  it("不支持的额外信息报错", () => {
    assert.throws(
      () => plainTextToLyricLines("hi\n :x: ruby", [createLine("a")]),
      "不支持的额外信息",
    );
  });

  it("~ 的位置不是原歌词的行边界时报错", () => {
    assert.throws(() => plainTextToLyricLines("~|b||c", joinBase()), "不是原歌词的行边界");
  });

  it("原歌词的行边界处不是 ~ 时报错", () => {
    assert.throws(() => plainTextToLyricLines("a|b||~", joinBase()), "必须是 ~ 拼接单词");
  });

  it("~ 拼接的后一行开始时间早于前一行结束时间时报错", () => {
    const base = [createLine("a", 100, 200), createLine("b", 0, 50)];
    assert.throws(() => plainTextToLyricLines("a|~|b", base), "开始时间早于前一行的结束时间");
  });

  it("并词符前后没有可以合并的单词时报错", () => {
    assert.throws(() => plainTextToLyricLines("->|b", twoWords()), "前面没有可以合并的单词");
    assert.throws(() => plainTextToLyricLines("a|<-", twoWords()), "后面没有可以合并的单词");
  });
});
