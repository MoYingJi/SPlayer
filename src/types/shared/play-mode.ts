/**
 * 循环模式
 *
 * off: 不循环 | list: 列表循环 | one: 单曲循环
 */
export type RepeatModeType = "off" | "list" | "one";

/**
 * 随机模式
 *
 * off: 关闭 | on: 随机播放 | heartbeat: 心动模式
 */
export type ShuffleModeType = "off" | "on" | "heartbeat";

/**
 * 用于 "play-mode-change" 事件的负载结构
 */
export interface PlayModePayload {
  repeatMode: RepeatModeType;
  shuffleMode: ShuffleModeType;
}

/**
 * 私人 FM 主模式
 */
export type PersonalFmMode = "DEFAULT" | "FAMILIAR" | "EXPLORE" | "SCENE_RCMD";

/**
 * 私人 FM 场景子模式（当 mode 为 SCENE_RCMD 时）
 */
export type PersonalFmSubMode =
  | "EXERCISE"
  | "FOCUS"
  | "SLEEP_HELP"
  | "COMMUTE"
  | "COFFEE_SHOP"
  | "TAKE_SHOWER"
  | "GAMES"
  | "RELAX"
  | "CHEERFUL"
  | "NIGHT_EMO"
  | "CURE"
  | "LYRICAL"
  | "SWEET"
  | "INSPIRATIONAL"
  | "RAINY"
  | "GUOFENG"
  | "CHINESE"
  | "ENGLISH"
  | "YUEYU"
  | "JAPANESE"
  | "K_POP"
  | "FRANCH"
  | "GLOBAL"
  | "ELECTRONIC"
  | "RAP"
  | "ROCK"
  | "FOLK"
  | "ACG"
  | "LIGHT"
  | "JAZZ"
  | "GUDIAN"
  | "RHYTHM_BLUES"
  | "BLUE"
  | "PUNK"
  | "DANCE"
  | "LATIN"
  | "COUNTRY"
  | "MANYAO"
  | "JINGDIAN"
  | "ORIGINAL_MUSICIAL"
  | "MUSICAL"
  | "YINGSHI";

/**
 * 私人 FM 模式选项
 */
export interface PersonalFmOptions {
  /** 推荐模式 */
  mode?: PersonalFmMode;
  /** 场景子模式（仅 SCENE_RCMD 时有效） */
  submode?: PersonalFmSubMode;
  /** 获取数量 */
  limit?: number;
}
