import {
  BrowserWindow,
  MenuItemConstructorOptions,
  Menu,
  session,
  dialog,
  ipcMain,
} from "electron";
import icon from "../../public/icons/favicon.png?asset";

const openLoginWin = (mainWin: BrowserWindow) => {
  const loginSession = session.fromPartition("login-win");
  const loginWin = new BrowserWindow({
    parent: mainWin,
    title: "登录网易云音乐",
    width: 1280,
    height: 800,
    center: true,
    modal: true,
    icon,
    // resizable: false,
    // movable: false,
    // minimizable: false,
    // maximizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      partition: "login-win",
    },
  });

  // 打开网易云
  loginWin.loadURL("https://music.163.com/#/my/");

  // 阻止新窗口创建
  loginWin.webContents.setWindowOpenHandler(() => {
    return { action: "deny" };
  });

  // 登录完成
  const loginFinish = async () => {
    if (!loginWin) return;
    // 获取 Cookie
    const cookies = await loginWin.webContents.session.cookies.get({ name: "MUSIC_U" });
    if (!cookies?.[0]?.value) {
      dialog.showMessageBox({
        type: "info",
        title: "登录失败",
        message: "未查找到登录信息，请重试",
      });
      return;
    }
    const value = `MUSIC_U=${cookies[0].value};`;
    // 发送回主进程
    mainWin?.webContents.send("send-cookies", value);
    await loginSession?.clearStorageData();
    loginWin.close();
  };

  // 页面注入
  // loginWin.webContents.once("did-finish-load", () => {
  //   const script = `
  //     const style = document.createElement('style');
  //     style.innerHTML = \`
  //       .login-btn {
  //         position: fixed;
  //         left: 0;
  //         bottom: 0;
  //         width: 100%;
  //         height: 80px;
  //         display: flex;
  //         align-items: center;
  //         justify-content: center;
  //         background-color: #242424;
  //         z-index: 99999;
  //       }

  //       .login-btn span {
  //         color: white;
  //         margin-right: 20px;
  //       }

  //       .login-btn button {
  //         border: none;
  //         outline: none;
  //         background-color: #c20c0c;
  //         border-radius: 25px;
  //         color: white;
  //         height: 40px;
  //         padding: 0 20px;
  //         cursor: pointer;
  //       }
  //     \`;
  //     document.head.appendChild(style);
  //     const div = document.createElement('div');
  //     div.className = 'login-btn';
  //     div.innerHTML = \`
  //       <span>请在登录成功后点击</span>
  //       <button>登录完成</button>
  //     \`;
  //     div.querySelector('button').addEventListener('click', () => {
  //       window.electron.ipcRenderer.send("login-success");
  //     });
  //     document.body.appendChild(div);
  //   `;
  //   loginWin.webContents.executeJavaScript(script);
  // });

  // 监听事件
  ipcMain.on("login-success", loginFinish);

  // 菜单栏
  const menuTemplate: MenuItemConstructorOptions[] = [
    {
      label: "登录完成",
      click: loginFinish,
    },
  ];
  const menu = Menu.buildFromTemplate(menuTemplate);
  loginWin.setMenu(menu);
};

export default openLoginWin;
