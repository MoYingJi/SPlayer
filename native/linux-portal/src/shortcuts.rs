//! XDG Desktop Portal 全局快捷键实现
//!
//! 通过 `org.freedesktop.portal.GlobalShortcuts` 接口注册全局快捷键，
//! 在 Wayland / X11 下替代 Electron 的 `globalShortcut`

use std::{
    collections::HashSet,
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};

use ashpd::desktop::{
    CreateSessionOptions, Session,
    global_shortcuts::{
        Activated, BindShortcutsOptions, ConfigureShortcutsOptions, GlobalShortcuts, NewShortcut,
    },
};
use futures_util::{Stream, StreamExt};
use napi::{
    Status,
    bindgen_prelude::{Function, Unknown},
    threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode, UnknownReturnValue},
};
use napi_derive::napi;
use tokio::{
    runtime::Runtime,
    sync::{mpsc, oneshot},
    task::JoinHandle,
};

/// 快捷键激活事件（通过 JS 回调派发）
#[napi(object)]
#[derive(Debug, Clone)]
pub struct ShortcutActivatedEvent {
    /// 应用内快捷键 ID
    #[napi(js_name = "shortcutId")]
    pub shortcut_id: String,
    /// 触发时间戳（毫秒）
    pub timestamp: f64,
}

/// 单个快捷键描述
#[napi(object)]
#[derive(Debug, Clone)]
pub struct ShortcutDescriptor {
    /// 应用内唯一 ID，用于识别触发的是哪个快捷键
    pub id: String,
    /// 用户可读的描述文本，会显示在系统确认弹窗中
    pub description: String,
    /// Electron 格式的推荐触发键（如 "CmdOrCtrl+Shift+M"），可为空（不传推荐键）
    #[napi(js_name = "preferShortcut")]
    pub prefer_shortcut: Option<String>,
}

/// JS 侧注册的激活事件回调
type ShortcutHandler = ThreadsafeFunction<
    ShortcutActivatedEvent,
    UnknownReturnValue,
    ShortcutActivatedEvent,
    Status,
    false,
>;

/// portal 绑定请求超时时间（用户需在系统弹窗中确认，放宽到 90 秒）
const BIND_WAIT_TIMEOUT: Duration = Duration::from_secs(90);
/// 各类连接 / 调用请求的超时时间
///
/// 主要保护桌面环境无响应场景，避免任何 portal 调用永久挂起调用方
const CALL_TIMEOUT: Duration = Duration::from_secs(15);

/// 后台线程指令
enum Command {
    /// 注册激活回调
    RegisterHandler(ShortcutHandler),
    /// 检测 portal 是否可用
    CheckSupport { reply: oneshot::Sender<bool> },
    /// 创建会话并绑定快捷键，回传被拒绝的快捷键 ID
    Bind {
        shortcuts: Vec<ShortcutDescriptor>,
        reply: oneshot::Sender<Result<Vec<String>, String>>,
    },
    /// 关闭会话并解绑全部快捷键
    Unbind {
        reply: oneshot::Sender<Result<(), String>>,
    },
    /// 请求桌面环境打开快捷键配置界面
    Configure {
        reply: oneshot::Sender<Result<(), String>>,
    },
    /// 停止后台线程
    Shutdown,
}

/// 全局快捷键管理器
///
/// 通过 XDG Desktop Portal 注册全局快捷键，绕过 Electron 的 `globalShortcut`
#[napi(js_name = "GlobalShortcuts")]
pub struct NapiGlobalShortcuts {
    sender: mpsc::UnboundedSender<Command>,
}

#[napi]
impl NapiGlobalShortcuts {
    /// 创建全局快捷键管理器
    ///
    /// 会启动一个后台线程运行 D-Bus 事件循环，`bind` 之后快捷键激活时通过回调通知
    #[napi(
        constructor,
        ts_args_type = "callback: (event: ShortcutActivatedEvent) => void"
    )]
    #[allow(clippy::needless_pass_by_value)]
    pub fn new(callback: Function<Unknown<'static>, UnknownReturnValue>) -> napi::Result<Self> {
        let handler = callback
            .build_threadsafe_function::<ShortcutActivatedEvent>()
            .build_callback(|ctx| Ok(ctx.value))?;

        let (sender, receiver) = mpsc::unbounded_channel();
        let _ = sender.send(Command::RegisterHandler(handler));

        // 后台线程运行 D-Bus 事件循环
        thread::spawn(move || {
            let Ok(rt) = Runtime::new() else {
                // 无法创建 runtime 时后台线程直接退出
                return;
            };
            rt.block_on(run_loop(receiver));
        });

        Ok(Self { sender })
    }

    /// 当前环境下 portal 是否可用（接口存在且版本 >= 1）
    ///
    /// 探测在后台线程的常驻 runtime 上执行。注意不能用临时 runtime：
    /// ashpd 会把 D-Bus 连接缓存在静态变量里，临时 runtime 销毁后缓存连接随之失效，
    /// 后续所有 portal 调用都会永久挂起
    #[napi]
    pub async fn is_supported(&self) -> napi::Result<bool> {
        let (reply_tx, reply_rx) = oneshot::channel();
        self.sender
            .send(Command::CheckSupport { reply: reply_tx })
            .map_err(|_| napi::Error::from_reason("后台线程已退出".to_string()))?;

        reply_rx
            .await
            .map_err(|_| napi::Error::from_reason("后台线程已退出".to_string()))
    }

    /// 创建会话并绑定快捷键
    ///
    /// 会弹出系统确认窗口，返回用户拒绝绑定或未绑定成功的快捷键 ID 列表，
    /// 全部成功时返回空数组
    #[napi]
    pub async fn bind(&self, shortcuts: Vec<ShortcutDescriptor>) -> napi::Result<Vec<String>> {
        let (reply_tx, reply_rx) = oneshot::channel();
        self.sender
            .send(Command::Bind {
                shortcuts,
                reply: reply_tx,
            })
            .map_err(|_| napi::Error::from_reason("后台线程已退出".to_string()))?;

        match reply_rx
            .await
            .map_err(|_| napi::Error::from_reason("后台线程已退出".to_string()))?
        {
            Ok(failed) => Ok(failed),
            Err(reason) => Err(napi::Error::from_reason(reason)),
        }
    }

    /// 关闭会话，解绑全部快捷键
    #[napi]
    pub async fn unbind(&self) -> napi::Result<()> {
        let (reply_tx, reply_rx) = oneshot::channel();
        self.sender
            .send(Command::Unbind { reply: reply_tx })
            .map_err(|_| napi::Error::from_reason("后台线程已退出".to_string()))?;

        reply_rx
            .await
            .map_err(|_| napi::Error::from_reason("后台线程已退出".to_string()))?
            .map_err(napi::Error::from_reason)
    }

    /// 请求桌面环境打开快捷键配置界面
    ///
    /// portal 模式下应用内无法自定义快捷键，只能由用户在系统设置中修改。
    /// 需要已经 `bind` 成功建立会话，否则会返回错误
    #[napi]
    pub async fn configure(&self) -> napi::Result<()> {
        let (reply_tx, reply_rx) = oneshot::channel();
        self.sender
            .send(Command::Configure { reply: reply_tx })
            .map_err(|_| napi::Error::from_reason("后台线程已退出".to_string()))?;

        reply_rx
            .await
            .map_err(|_| napi::Error::from_reason("后台线程已退出".to_string()))?
            .map_err(napi::Error::from_reason)
    }

    /// 停止后台线程，释放资源
    ///
    /// 应在应用退出时调用，调用后不应再使用该实例
    #[napi]
    pub fn dispose(&self) {
        let _ = self.sender.send(Command::Shutdown);
    }
}

/// 后台 D-Bus 事件循环
async fn run_loop(mut rx: mpsc::UnboundedReceiver<Command>) {
    // 激活事件通道，供信号监听任务向主循环派发
    let (evt_tx, mut evt_rx) = mpsc::unbounded_channel::<ShortcutActivatedEvent>();
    // 当前绑定的快捷键 ID，用于过滤其他应用触发的事件
    let registered_ids: Arc<Mutex<HashSet<String>>> = Arc::new(Mutex::new(HashSet::new()));

    let mut portal: Option<GlobalShortcuts> = None;
    let mut session: Option<Session<GlobalShortcuts>> = None;
    let mut signal_task: Option<JoinHandle<()>> = None;
    let mut handler: Option<ShortcutHandler> = None;

    loop {
        tokio::select! {
            cmd = rx.recv() => {
                let Some(cmd) = cmd else { break };
                let keep_running = handle_command(
                    cmd,
                    &mut portal,
                    &mut session,
                    &mut signal_task,
                    &registered_ids,
                    &evt_tx,
                    &mut handler,
                ).await;
                if !keep_running {
                    break;
                }
            }
            evt = evt_rx.recv() => {
                if let Some(evt) = evt
                    && let Some(h) = &handler
                {
                    h.call(evt, ThreadsafeFunctionCallMode::NonBlocking);
                }
            }
        }
    }
}

/// 处理后台线程指令，返回是否继续运行
#[allow(clippy::too_many_arguments)]
async fn handle_command(
    cmd: Command,
    portal: &mut Option<GlobalShortcuts>,
    session: &mut Option<Session<GlobalShortcuts>>,
    signal_task: &mut Option<JoinHandle<()>>,
    registered_ids: &Arc<Mutex<HashSet<String>>>,
    evt_tx: &mpsc::UnboundedSender<ShortcutActivatedEvent>,
    handler: &mut Option<ShortcutHandler>,
) -> bool {
    match cmd {
        Command::RegisterHandler(tsfn) => *handler = Some(tsfn),
        Command::CheckSupport { reply } => {
            let supported = check_support().await;
            let _ = reply.send(supported);
        }
        Command::Bind { shortcuts, reply } => {
            let result = bind_shortcuts(
                portal,
                session,
                signal_task,
                registered_ids,
                evt_tx,
                &shortcuts,
            )
            .await;
            let _ = reply.send(result);
        }
        Command::Unbind { reply } => {
            let result = unbind(portal, session, signal_task, registered_ids).await;
            let _ = reply.send(result);
        }
        Command::Configure { reply } => {
            let result = configure_shortcuts(portal.as_ref(), session.as_ref()).await;
            let _ = reply.send(result);
        }
        Command::Shutdown => return false,
    }
    true
}

/// 探测 portal 的 GlobalShortcuts 接口是否可用
async fn check_support() -> bool {
    let probe = async {
        GlobalShortcuts::new()
            .await
            .is_ok_and(|gs| gs.version() >= 1)
    };
    // 部分环境下 portal 服务无响应，加超时避免卡住
    tokio::time::timeout(CALL_TIMEOUT, probe)
        .await
        .unwrap_or(false)
}

/// 请求桌面环境打开快捷键配置界面
async fn configure_shortcuts(
    portal: Option<&GlobalShortcuts>,
    session: Option<&Session<GlobalShortcuts>>,
) -> Result<(), String> {
    let (Some(gs), Some(sess)) = (portal, session) else {
        return Err("尚未绑定快捷键，无法打开配置界面".to_string());
    };

    tokio::time::timeout(
        CALL_TIMEOUT,
        gs.configure_shortcuts(sess, None, ConfigureShortcutsOptions::default()),
    )
    .await
    .map_err(|_| "打开配置界面超时".to_string())?
    .map_err(|e| format!("打开配置界面失败: {e}"))
}

/// 关闭会话并解绑全部快捷键，同时重置 portal 与信号监听
async fn unbind(
    portal: &mut Option<GlobalShortcuts>,
    session: &mut Option<Session<GlobalShortcuts>>,
    signal_task: &mut Option<JoinHandle<()>>,
    registered_ids: &Arc<Mutex<HashSet<String>>>,
) -> Result<(), String> {
    // 关闭会话，portal 会自动解绑其中注册的快捷键
    if let Some(s) = session.take() {
        let _ = s.close().await;
    }
    if let Ok(mut guard) = registered_ids.lock() {
        guard.clear();
    }
    // 终止信号监听任务
    if let Some(task) = signal_task.take() {
        task.abort();
    }
    *portal = None;
    Ok(())
}

/// 创建会话并绑定快捷键，返回被拒绝的快捷键 ID 列表
#[allow(clippy::too_many_arguments)]
async fn bind_shortcuts(
    portal: &mut Option<GlobalShortcuts>,
    session: &mut Option<Session<GlobalShortcuts>>,
    signal_task: &mut Option<JoinHandle<()>>,
    registered_ids: &Arc<Mutex<HashSet<String>>>,
    evt_tx: &mpsc::UnboundedSender<ShortcutActivatedEvent>,
    shortcuts: &[ShortcutDescriptor],
) -> Result<Vec<String>, String> {
    // 先关闭旧会话，保证绑定结果与本次传入的快捷键一致
    unbind(portal, session, signal_task, registered_ids).await?;

    // 惰性创建 portal 并订阅 Activated 信号
    if portal.is_none() {
        let gs = tokio::time::timeout(CALL_TIMEOUT, GlobalShortcuts::new())
            .await
            .map_err(|_| "连接 GlobalShortcuts 超时".to_string())?
            .map_err(|e| format!("连接 GlobalShortcuts 失败: {e}"))?;
        let stream = tokio::time::timeout(CALL_TIMEOUT, gs.receive_activated())
            .await
            .map_err(|_| "订阅 Activated 信号超时".to_string())?
            .map_err(|e| format!("订阅 Activated 信号失败: {e}"))?;
        *signal_task = Some(spawn_signal_task(
            stream,
            registered_ids.clone(),
            evt_tx.clone(),
        ));
        *portal = Some(gs);
    }
    let gs = portal.as_ref().ok_or("portal 未创建")?;

    // 创建全局快捷键会话
    let new_session = tokio::time::timeout(
        CALL_TIMEOUT,
        gs.create_session(CreateSessionOptions::default()),
    )
    .await
    .map_err(|_| "创建会话超时".to_string())?
    .map_err(|e| format!("创建会话失败: {e}"))?;

    let requested_ids: Vec<String> = shortcuts.iter().map(|s| s.id.clone()).collect();

    // 将 Electron 快捷键格式转为 XDG 格式
    let new_shortcuts: Vec<NewShortcut> = shortcuts
        .iter()
        .map(|s| {
            let mut ns = NewShortcut::new(s.id.clone(), s.description.clone());
            if let Some(xdg) = s.prefer_shortcut.as_deref().and_then(electron_to_xdg) {
                ns = ns.preferred_trigger(xdg.as_str());
            }
            ns
        })
        .collect();

    // 发起绑定请求并等待用户在系统弹窗中确认
    let request = tokio::time::timeout(
        BIND_WAIT_TIMEOUT,
        gs.bind_shortcuts(
            &new_session,
            &new_shortcuts,
            None,
            BindShortcutsOptions::default(),
        ),
    )
    .await
    .map_err(|_| "发起绑定请求超时".to_string())?
    .map_err(|e| format!("发起绑定请求失败: {e}"))?;

    // 等待 Response 信号，桌面环境异常时加超时避免永久挂起
    let response = match request.response() {
        Ok(resp) => resp,
        // 用户取消弹窗时视为全部绑定失败
        Err(_) => return Ok(requested_ids),
    };

    // 响应中只包含被用户确认的快捷键
    let registered: Vec<String> = response
        .shortcuts()
        .iter()
        .map(|s| s.id().to_string())
        .collect();
    let failed: Vec<String> = requested_ids
        .iter()
        .filter(|id| !registered.contains(id))
        .cloned()
        .collect();

    // 记录确认绑定的快捷键，供信号过滤使用
    if let Ok(mut guard) = registered_ids.lock() {
        guard.extend(registered);
    }
    *session = Some(new_session);

    Ok(failed)
}

/// 启动 Activated 信号监听任务
fn spawn_signal_task(
    stream: impl Stream<Item = Activated> + Send + 'static,
    registered_ids: Arc<Mutex<HashSet<String>>>,
    evt_tx: mpsc::UnboundedSender<ShortcutActivatedEvent>,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        futures_util::pin_mut!(stream);
        while let Some(evt) = stream.next().await {
            // 仅派发本次应用注册的快捷键，忽略其他应用会话的事件
            let is_registered = registered_ids
                .lock()
                .map(|guard| guard.contains(evt.shortcut_id()))
                .unwrap_or(false);
            if !is_registered {
                continue;
            }
            let _ = evt_tx.send(ShortcutActivatedEvent {
                shortcut_id: evt.shortcut_id().to_string(),
                timestamp: evt.timestamp().as_millis() as f64,
            });
        }
    })
}

/// 将 Electron accelerator 转为 XDG shortcuts 规范格式
///
/// 例如 "CmdOrCtrl+Shift+Space" -> "CTRL+SHIFT+SPACE"，无法识别时返回 `None`
fn electron_to_xdg(accelerator: &str) -> Option<String> {
    let mut modifiers: Vec<&str> = Vec::new();
    let mut keys: Vec<String> = Vec::new();

    for part in accelerator.split('+') {
        match part {
            "CommandOrControl" | "CmdOrCtrl" | "Command" | "Control" | "Ctrl" | "Cmd" => {
                modifiers.push("CTRL");
            }
            "Shift" => modifiers.push("SHIFT"),
            "Alt" => modifiers.push("ALT"),
            "Super" | "Meta" => modifiers.push("SUPER"),
            key => keys.push(xdg_key_name(key)?),
        }
    }

    if keys.is_empty() {
        return None;
    }

    let mut parts: Vec<&str> = modifiers;
    parts.extend(keys.iter().map(String::as_str));
    Some(parts.join("+"))
}

/// 单个按键名映射到 XDG 规范格式
fn xdg_key_name(key: &str) -> Option<String> {
    let upper = key.to_ascii_uppercase();
    let mapped = match upper.as_str() {
        "SPACE" => "SPACE".to_string(),
        "PLUS" => "PLUS".to_string(),
        "ARROWUP" | "UP" => "UP".to_string(),
        "ARROWDOWN" | "DOWN" => "DOWN".to_string(),
        "ARROWLEFT" | "LEFT" => "LEFT".to_string(),
        "ARROWRIGHT" | "RIGHT" => "RIGHT".to_string(),
        "ENTER" | "RETURN" => "RETURN".to_string(),
        "ESCAPE" | "ESC" => "ESCAPE".to_string(),
        "TAB" => "TAB".to_string(),
        "BACKSPACE" => "BACKSPACE".to_string(),
        "DELETE" => "DELETE".to_string(),
        "INSERT" => "INSERT".to_string(),
        "HOME" => "HOME".to_string(),
        "END" => "END".to_string(),
        "PAGEUP" => "PAGE_UP".to_string(),
        "PAGEDOWN" => "PAGE_DOWN".to_string(),
        "CAPSLOCK" => "CAPS_LOCK".to_string(),
        "NUMLOCK" => "NUM_LOCK".to_string(),
        "MEDIAPLAYPAUSE" | "MEDIAPLAY" => "XF86AudioPlay".to_string(),
        "MEDIAPLAYNEXT" | "MEDIANEXTTRACK" => "XF86AudioNext".to_string(),
        "MEDIAPLAYPREVIOUS" | "MEDIAPREVIOUSTRACK" => "XF86AudioPrev".to_string(),
        "MEDIASTOP" => "XF86AudioStop".to_string(),
        "VOLUMEMUTE" => "XF86AudioMute".to_string(),
        "VOLUMEUP" => "XF86AudioRaiseVolume".to_string(),
        "VOLUMEDOWN" => "XF86AudioLowerVolume".to_string(),
        _ => {
            // 单字符字母数字与 F1-F24 直接大写
            let is_single = upper.len() == 1
                && upper
                    .chars()
                    .next()
                    .is_some_and(|c| c.is_ascii_alphanumeric());
            let is_function = upper.len() > 1
                && upper.starts_with('F')
                && upper[1..].chars().all(|c| c.is_ascii_digit());
            if is_single || is_function {
                upper
            } else {
                return None;
            }
        }
    };
    Some(mapped)
}

#[cfg(test)]
mod tests {
    use super::electron_to_xdg;

    #[test]
    fn converts_common_shortcuts() {
        assert_eq!(
            electron_to_xdg("CmdOrCtrl+Shift+Space").as_deref(),
            Some("CTRL+SHIFT+SPACE")
        );
        assert_eq!(
            electron_to_xdg("Alt+CmdOrCtrl+M").as_deref(),
            Some("ALT+CTRL+M")
        );
        assert_eq!(electron_to_xdg("F5").as_deref(), Some("F5"));
        assert_eq!(
            electron_to_xdg("MediaPlayPause").as_deref(),
            Some("XF86AudioPlay")
        );
        assert_eq!(
            electron_to_xdg("CmdOrCtrl+Shift+Left").as_deref(),
            Some("CTRL+SHIFT+LEFT")
        );
        assert_eq!(
            electron_to_xdg("Super+Shift+Z").as_deref(),
            Some("SUPER+SHIFT+Z")
        );
    }

    #[test]
    fn rejects_unknown_keys() {
        assert_eq!(electron_to_xdg("CmdOrCtrl+WhatIsThis"), None);
        assert_eq!(electron_to_xdg(""), None);
        assert_eq!(electron_to_xdg("CmdOrCtrl"), None);
    }
}
