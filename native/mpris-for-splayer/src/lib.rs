use napi::bindgen_prelude::*;
use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode, UnknownReturnValue};
use napi::Status;
use napi_derive::napi;
use std::sync::{Arc, Mutex};
use mpris_server::{
    LoopStatus, Metadata, PlaybackStatus, PlayerInterface, Property, RootInterface, Server, Signal,
    Time, TrackId, zbus,
};

// 定义 MPRIS 事件类型
#[napi(object)]
#[derive(Clone)]
pub struct MprisEvent {
    pub event_type: String,
    pub value: Option<f64>,
}

#[napi(object)]
pub struct TrackInfo {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub length: Option<i64>, // milliseconds (from JS)
    pub url: Option<String>,
}

// 播放器后端实现
#[derive(Clone)]
struct SPlayerBackend {
    metadata: Arc<Mutex<Metadata>>,
    playback_status: Arc<Mutex<PlaybackStatus>>,
    position: Arc<Mutex<Time>>,
    loop_status: Arc<Mutex<LoopStatus>>,
    volume: Arc<Mutex<f64>>,
    rate: Arc<Mutex<f64>>,
    shuffle: Arc<Mutex<bool>>,
    event_callback: Arc<Mutex<Option<ThreadsafeFunction<MprisEvent, UnknownReturnValue, MprisEvent, Status, false>>>>,
}

impl SPlayerBackend {
    fn new() -> Self {
        // 初始化 Metadata，确保包含 trackid
        let mut meta = Metadata::new();
        let tid = TrackId::try_from("/org/splayer/CurrentTrack").unwrap_or(TrackId::NO_TRACK);
        meta.set_trackid(Some(tid));

        Self {
            metadata: Arc::new(Mutex::new(meta)),
            playback_status: Arc::new(Mutex::new(PlaybackStatus::Stopped)),
            position: Arc::new(Mutex::new(Time::from_micros(0))),
            loop_status: Arc::new(Mutex::new(LoopStatus::None)),
            volume: Arc::new(Mutex::new(1.0)),
            rate: Arc::new(Mutex::new(1.0)),
            shuffle: Arc::new(Mutex::new(false)),
            event_callback: Arc::new(Mutex::new(None)),
        }
    }

    fn emit_event(&self, event_type: &str, value: Option<f64>) {
        if let Some(callback) = self.event_callback.lock().unwrap().as_ref() {
            let event = MprisEvent {
                event_type: event_type.to_string(),
                value,
            };
            let status = callback.call(event, ThreadsafeFunctionCallMode::NonBlocking);
            if status != napi::Status::Ok {
                eprintln!("[MPRIS] 调用 JS 回调失败, status: {:?}", status);
            }
        }
    }
}

impl RootInterface for SPlayerBackend {
    async fn raise(&self) -> zbus::fdo::Result<()> {
        Ok(())
    }

    async fn quit(&self) -> zbus::fdo::Result<()> {
        Ok(())
    }

    async fn can_quit(&self) -> zbus::fdo::Result<bool> {
        Ok(false)
    }

    async fn fullscreen(&self) -> zbus::fdo::Result<bool> {
        Ok(false)
    }

    async fn set_fullscreen(&self, _fullscreen: bool) -> zbus::Result<()> {
        Ok(())
    }

    async fn can_set_fullscreen(&self) -> zbus::fdo::Result<bool> {
        Ok(false)
    }

    async fn can_raise(&self) -> zbus::fdo::Result<bool> {
        Ok(true)
    }

    async fn has_track_list(&self) -> zbus::fdo::Result<bool> {
        Ok(false)
    }

    async fn identity(&self) -> zbus::fdo::Result<String> {
        Ok("SPlayer".to_string())
    }

    async fn desktop_entry(&self) -> zbus::fdo::Result<String> {
        Ok("splayer".to_string())
    }

    async fn supported_uri_schemes(&self) -> zbus::fdo::Result<Vec<String>> {
        Ok(vec!["file".into(), "http".into(), "https".into()])
    }

    async fn supported_mime_types(&self) -> zbus::fdo::Result<Vec<String>> {
        Ok(vec![
            "audio/mpeg".into(),
            "audio/aac".into(),
            "audio/ogg".into(),
            "audio/flac".into(),
            "audio/wav".into(),
        ])
    }
}

impl PlayerInterface for SPlayerBackend {
    async fn next(&self) -> zbus::fdo::Result<()> {
        self.emit_event("next", None);
        Ok(())
    }

    async fn previous(&self) -> zbus::fdo::Result<()> {
        self.emit_event("previous", None);
        Ok(())
    }
    async fn pause(&self) -> zbus::fdo::Result<()> {
        self.emit_event("pause", None);
        Ok(())
    }
    async fn play_pause(&self) -> zbus::fdo::Result<()> {
        self.emit_event("play_pause", None);
        Ok(())
    }
    async fn stop(&self) -> zbus::fdo::Result<()> {
        self.emit_event("stop", None);
        Ok(())
    }
    async fn play(&self) -> zbus::fdo::Result<()> {
        self.emit_event("play", None);
        Ok(())
    }
    async fn seek(&self, offset: Time) -> zbus::fdo::Result<()> {
        // offset 是微秒，转换为毫秒
        self.emit_event("seek", Some(offset.as_micros() as f64 / 1000.0));
        Ok(())
    }
    async fn set_position(&self, _track_id: TrackId, position: Time) -> zbus::fdo::Result<()> {
        *self.position.lock().unwrap() = position;
        // 位置变化以毫秒为单位
        self.emit_event("set_position", Some(position.as_micros() as f64 / 1000.0));
        Ok(())
    }
    async fn open_uri(&self, _uri: String) -> zbus::fdo::Result<()> { Ok(()) }
    async fn playback_status(&self) -> zbus::fdo::Result<PlaybackStatus> {
        Ok(*self.playback_status.lock().unwrap())
    }
    async fn loop_status(&self) -> zbus::fdo::Result<LoopStatus> { Ok(*self.loop_status.lock().unwrap()) }
    async fn set_loop_status(&self, loop_status: LoopStatus) -> zbus::Result<()> {
        *self.loop_status.lock().unwrap() = loop_status; Ok(())
    }
    async fn shuffle(&self) -> zbus::fdo::Result<bool> { Ok(*self.shuffle.lock().unwrap()) }
    async fn set_shuffle(&self, shuffle: bool) -> zbus::Result<()> { *self.shuffle.lock().unwrap() = shuffle; Ok(()) }
    async fn volume(&self) -> zbus::fdo::Result<f64> { Ok(*self.volume.lock().unwrap()) }
    async fn set_volume(&self, volume: f64) -> zbus::Result<()> { *self.volume.lock().unwrap() = volume; Ok(()) }
    async fn metadata(&self) -> zbus::fdo::Result<Metadata> { Ok(self.metadata.lock().unwrap().clone()) }
    async fn position(&self) -> zbus::fdo::Result<Time> { Ok(*self.position.lock().unwrap()) }
    async fn rate(&self) -> zbus::fdo::Result<f64> { Ok(*self.rate.lock().unwrap()) }
    async fn set_rate(&self, rate: f64) -> zbus::Result<()> { *self.rate.lock().unwrap() = rate; Ok(()) }
    async fn minimum_rate(&self) -> zbus::fdo::Result<f64> { Ok(1.0) }
    async fn maximum_rate(&self) -> zbus::fdo::Result<f64> { Ok(1.0) }
    async fn can_go_next(&self) -> zbus::fdo::Result<bool> { Ok(true) }
    async fn can_go_previous(&self) -> zbus::fdo::Result<bool> { Ok(true) }
    async fn can_play(&self) -> zbus::fdo::Result<bool> { Ok(true) }
    async fn can_pause(&self) -> zbus::fdo::Result<bool> { Ok(true) }
    async fn can_seek(&self) -> zbus::fdo::Result<bool> { Ok(true) }
    async fn can_control(&self) -> zbus::fdo::Result<bool> { Ok(true) }
}

#[napi]
pub struct SPlayerMpris {
    backend: SPlayerBackend,
    server: Arc<Server<SPlayerBackend>>,
    rt: Arc<tokio::runtime::Runtime>,
}

#[napi]
impl SPlayerMpris {
    #[napi(constructor)]
    pub fn new() -> Result<Self> {
        let backend = SPlayerBackend::new();
        let rt = tokio::runtime::Runtime::new().map_err(|e| Error::from_reason(e.to_string()))?;

        let server = rt
            .block_on(async { Server::new("splayer", backend.clone()).await })
            .map_err(|e| Error::from_reason(e.to_string()))?;

        Ok(Self {
            backend,
            server: Arc::new(server),
            rt: Arc::new(rt),
        })
    }

    #[napi(ts_args_type = "callback: (event: MprisEvent) => void")]
    pub fn register_event_handler(
        &self,
        callback: Function<Unknown<'static>, UnknownReturnValue>,
    ) -> Result<()> {
        let tsfn = callback
            .build_threadsafe_function::<MprisEvent>()
            .build_callback(|ctx| Ok(ctx.value))?;

        *self.backend.event_callback.lock().unwrap() = Some(tsfn);
        Ok(())
    }

    #[napi]
    pub fn set_playback_status(&self, status: String) -> Result<()> {
        let new_status = match status.as_str() {
            "Playing" => PlaybackStatus::Playing,
            "Paused" => PlaybackStatus::Paused,
            _ => PlaybackStatus::Stopped,
        };
        *self.backend.playback_status.lock().unwrap() = new_status;
        {
            let server = self.server.clone();
            let handle = self.rt.handle().clone();
            handle.spawn(async move {
                let _ = server
                    .properties_changed([Property::PlaybackStatus(new_status)])
                    .await;
            });
        }
        Ok(())
    }

    #[napi]
    pub fn set_metadata(&self, info: TrackInfo) -> Result<()> {
        let mut meta = Metadata::new();
        let tid = TrackId::try_from("/org/splayer/CurrentTrack").unwrap_or(TrackId::NO_TRACK);
        meta.set_trackid(Some(tid));

        if let Some(title) = info.title { meta.set_title(Some(title)); }
        if let Some(artist) = info.artist { meta.set_artist(Some(vec![artist])); }
        if let Some(album) = info.album { meta.set_album(Some(album)); }
        if let Some(length) = info.length { meta.set_length(Some(Time::from_millis(length))); }
        if let Some(url) = info.url { meta.set_art_url(Some(url)); }

        *self.backend.metadata.lock().unwrap() = meta.clone();
        {
            let server = self.server.clone();
            let handle = self.rt.handle().clone();
            handle.spawn(async move {
                let _ = server.properties_changed([Property::Metadata(meta)]).await;
            });
        }
        Ok(())
    }

    #[napi]
    pub fn set_position(&self, pos: i64) -> Result<()> {
        *self.backend.position.lock().unwrap() = Time::from_micros(pos);
        // 位置变化使用 Seeked 信号
        {
            let server = self.server.clone();
            let handle = self.rt.handle().clone();
            let position = Time::from_micros(pos);
            handle.spawn(async move {
                let _ = server.emit(Signal::Seeked { position }).await;
            });
        }
        Ok(())
    }

    #[napi]
    pub fn set_loop_status(&self, status: String) -> Result<()> {
        let new_status = match status.as_str() {
            "Track" => LoopStatus::Track,
            "Playlist" => LoopStatus::Playlist,
            _ => LoopStatus::None,
        };
        *self.backend.loop_status.lock().unwrap() = new_status;
        {
            let server = self.server.clone();
            let handle = self.rt.handle().clone();
            handle.spawn(async move {
                let _ = server.properties_changed([Property::LoopStatus(new_status)]).await;
            });
        }
        Ok(())
    }

    #[napi]
    pub fn set_volume(&self, volume: f64) -> Result<()> {
        *self.backend.volume.lock().unwrap() = volume;
        {
            let server = self.server.clone();
            let handle = self.rt.handle().clone();
            handle.spawn(async move {
                let _ = server.properties_changed([Property::Volume(volume)]).await;
            });
        }
        Ok(())
    }

    #[napi]
    pub fn set_progress(&self, pos: i64, length: i64) -> Result<()> {
        *self.backend.position.lock().unwrap() = Time::from_micros(pos);

        // 可选更新时长
        if length > 0 {
            let mut meta = self.backend.metadata.lock().unwrap().clone();
            meta.set_length(Some(Time::from_micros(length)));
            *self.backend.metadata.lock().unwrap() = meta.clone();
            {
                let server = self.server.clone();
                let handle = self.rt.handle().clone();
                handle.spawn(async move {
                    let _ = server.properties_changed([Property::Metadata(meta)]).await;
                });
            }
        }

        // 位置变化使用 Seeked 信号
        {
            let server = self.server.clone();
            let handle = self.rt.handle().clone();
            let position = Time::from_micros(pos);
            handle.spawn(async move {
                let _ = server.emit(Signal::Seeked { position }).await;
            });
        }

        Ok(())
    }
}
