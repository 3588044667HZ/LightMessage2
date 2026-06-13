// Electron 类型存根 - 适用于 IDE 语法高亮与智能提示
// 参考: https://www.electronjs.org/docs/latest/api/

declare namespace Electron {

  // ========== 基础类型 ==========

  interface Event {
    preventDefault(): void;
    readonly defaultPrevented: boolean;
  }

  interface IpcMainEvent extends Event {
    readonly sender: WebContents;
    readonly senderId: number;
    readonly frameId: number;
    readonly processId: number;
    readonly ports: MessagePortMain[];
    returnValue?: unknown;
  }

  interface IpcRendererEvent extends Event {
    readonly sender: IpcRenderer;
    readonly senderId: number;
    readonly ports: MessagePort[];
  }

  interface MessagePortMain {
    postMessage(message: unknown): void;
    start(): void;
    close(): void;
    on(channel: 'message' | 'close', listener: Function): this;
  }

  // ========== Rectangle / Size / Point ==========

  interface Rectangle {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  interface Size {
    width: number;
    height: number;
  }

  interface Point {
    x: number;
    y: number;
  }

  // ========== WebContents ==========

  interface WebContents {
    send(channel: string, ...args: unknown[]): void;
    openDevTools(options?: { mode?: 'right' | 'bottom' | 'undocked' | 'detach' }): void;
    closeDevTools(): void;
    isDevToolsOpened(): boolean;
    loadURL(url: string, options?: { httpReferrer?: string; userAgent?: string; extraHeaders?: string; postData?: unknown[] }): Promise<void>;
    loadFile(filePath: string, options?: { query?: Record<string, string>; search?: string }): Promise<void>;
    reload(): void;
    getURL(): string;
    getTitle(): string;
    isDestroyed(): boolean;
    on(event: 'did-finish-load' | 'did-fail-load' | 'dom-ready' | 'crashed' | 'destroyed', listener: Function): this;
    once(event: string, listener: Function): this;
    removeListener(event: string, listener: Function): this;
    removeAllListeners(event?: string): this;
    session: Session;
  }

  interface Session {
    cookies: Cookies;
    clearCache(): Promise<void>;
    on(event: string, listener: Function): this;
  }

  interface Cookies {
    get(filter: { url?: string; name?: string; domain?: string; path?: string; secure?: boolean; session?: boolean }): Promise<Cookie[]>;
    set(details: { url: string; name?: string; value?: string; domain?: string; path?: string; secure?: boolean; httpOnly?: boolean; expirationDate?: number }): Promise<void>;
    remove(url: string, name: string): Promise<void>;
  }

  interface Cookie {
    name: string;
    value: string;
    domain: string;
    hostOnly: boolean;
    path: string;
    secure: boolean;
    httpOnly: boolean;
    session: boolean;
    expirationDate?: number;
  }

  // ========== BrowserWindow ==========

  interface BrowserWindowConstructorOptions {
    width?: number;
    height?: number;
    x?: number;
    y?: number;
    minWidth?: number;
    minHeight?: number;
    maxWidth?: number;
    maxHeight?: number;
    resizable?: boolean;
    movable?: boolean;
    minimizable?: boolean;
    maximizable?: boolean;
    closable?: boolean;
    focusable?: boolean;
    alwaysOnTop?: boolean;
    fullscreen?: boolean;
    fullscreenable?: boolean;
    skipTaskbar?: boolean;
    show?: boolean;
    frame?: boolean;
    title?: string;
    icon?: string;
    transparent?: boolean;
    opacity?: number;
    backgroundColor?: string;
    hasShadow?: boolean;
    titleBarStyle?: 'default' | 'hidden' | 'hiddenInset' | 'customButtonsOnHover';
    webPreferences?: WebPreferences;
  }

  interface WebPreferences {
    nodeIntegration?: boolean;
    contextIsolation?: boolean;
    preload?: string;
    sandbox?: boolean;
    webSecurity?: boolean;
    allowRunningInsecureContent?: boolean;
    devTools?: boolean;
    spellcheck?: boolean;
    enableRemoteModule?: boolean;
    nodeIntegrationInWorker?: boolean;
    nodeIntegrationInSubFrames?: boolean;
    backgroundThrottling?: boolean;
    images?: boolean;
    javascript?: boolean;
    webviewTag?: boolean;
  }

  class BrowserWindow {
    constructor(options?: BrowserWindowConstructorOptions);

    readonly id: number;
    readonly webContents: WebContents;

    loadURL(url: string, options?: { httpReferrer?: string; userAgent?: string; extraHeaders?: string }): Promise<void>;
    loadFile(filePath: string, options?: { query?: Record<string, string>; search?: string }): Promise<void>;
    show(): void;
    hide(): void;
    close(): void;
    destroy(): void;
    isDestroyed(): boolean;
    focus(): void;
    blur(): void;
    isFocused(): boolean;
    isVisible(): boolean;
    isMinimized(): boolean;
    isMaximized(): boolean;
    isFullScreen(): boolean;
    minimize(): void;
    maximize(): void;
    unmaximize(): void;
    restore(): void;
    setTitle(title: string): void;
    getTitle(): string;
    setSize(width: number, height: number, animate?: boolean): void;
    getSize(): [number, number];
    setContentSize(width: number, height: number, animate?: boolean): void;
    getContentSize(): [number, number];
    setMinimumSize(width: number, height: number): void;
    setMaximumSize(width: number, height: number): void;
    setPosition(x: number, y: number, animate?: boolean): void;
    getPosition(): [number, number];
    setBounds(bounds: Partial<Rectangle>, animate?: boolean): void;
    getBounds(): Rectangle;
    setContentBounds(bounds: Rectangle, animate?: boolean): void;
    getContentBounds(): Rectangle;
    setResizable(resizable: boolean): void;
    setAlwaysOnTop(flag: boolean, level?: 'normal' | 'floating' | 'torn-off-menu' | 'modal-panel' | 'main-menu' | 'status' | 'pop-up-menu' | 'screen-saver'): void;
    setOpacity(opacity: number): void;
    getOpacity(): number;
    setProgressBar(progress: number, options?: { mode?: 'none' | 'normal' | 'indeterminate' | 'error' | 'paused' }): void;
    setMenu(menu: Menu | null): void;
    getParentWindow(): BrowserWindow | null;
    setParentWindow(parent: BrowserWindow | null): void;

    on(event: 'close' | 'closed' | 'ready-to-show' | 'show' | 'hide' | 'focus' | 'blur' | 'maximize' | 'unmaximize' | 'minimize' | 'restore' | 'resize' | 'move' | 'moved' | 'enter-full-screen' | 'leave-full-screen' | 'page-title-updated', listener: Function): this;
    once(event: string, listener: Function): this;
    removeListener(event: string, listener: Function): this;
    removeAllListeners(event?: string): this;

    static getAllWindows(): BrowserWindow[];
    static getFocusedWindow(): BrowserWindow | null;
    static fromWebContents(webContents: WebContents): BrowserWindow | null;
    static fromId(id: number): BrowserWindow | null;
  }

  // ========== Menu / MenuItem ==========

  interface MenuItemConstructorOptions {
    label?: string;
    role?: string;
    type?: 'normal' | 'separator' | 'submenu' | 'checkbox' | 'radio';
    submenu?: MenuItemConstructorOptions[] | Menu;
    accelerator?: string;
    icon?: string;
    enabled?: boolean;
    visible?: boolean;
    checked?: boolean;
    click?: (menuItem: MenuItem, browserWindow: BrowserWindow, event: KeyboardEvent) => void;
  }

  class Menu {
    constructor();
    append(menuItem: MenuItem): void;
    insert(pos: number, menuItem: MenuItem): void;
    items: MenuItem[];
    popup(options?: { window?: BrowserWindow; x?: number; y?: number; positioningItem?: number }): void;
    closePopup(browserWindow?: BrowserWindow): void;
    static buildFromTemplate(template: MenuItemConstructorOptions[]): Menu;
    static setApplicationMenu(menu: Menu | null): void;
    static getApplicationMenu(): Menu | null;
  }

  class MenuItem {
    constructor(options: MenuItemConstructorOptions);
    label: string;
    type: string;
    role: string;
    enabled: boolean;
    visible: boolean;
    checked: boolean;
    submenu?: Menu;
  }

  // ========== Dialog ==========

  interface OpenDialogOptions {
    title?: string;
    defaultPath?: string;
    buttonLabel?: string;
    filters?: FileFilter[];
    properties?: Array<'openFile' | 'openDirectory' | 'multiSelections' | 'showHiddenFiles' | 'createDirectory' | 'promptToCreate'>;
  }

  interface SaveDialogOptions {
    title?: string;
    defaultPath?: string;
    buttonLabel?: string;
    filters?: FileFilter[];
    showsTagField?: boolean;
  }

  interface FileFilter {
    name: string;
    extensions: string[];
  }

  interface OpenDialogReturnValue {
    canceled: boolean;
    filePaths: string[];
    bookmarks?: string[];
  }

  interface SaveDialogReturnValue {
    canceled: boolean;
    filePath: string;
    bookmark?: string;
  }

  interface MessageBoxOptions {
    type?: 'none' | 'info' | 'error' | 'question' | 'warning';
    buttons?: string[];
    defaultId?: number;
    title?: string;
    message: string;
    detail?: string;
    checkboxLabel?: string;
    checkboxChecked?: boolean;
    cancelId?: number;
    noLink?: boolean;
  }

  interface MessageBoxReturnValue {
    response: number;
    checkboxChecked: boolean;
  }

  namespace dialog {
    function showOpenDialog(browserWindow: BrowserWindow, options: OpenDialogOptions): Promise<OpenDialogReturnValue>;
    function showOpenDialog(options: OpenDialogOptions): Promise<OpenDialogReturnValue>;
    function showSaveDialog(browserWindow: BrowserWindow, options: SaveDialogOptions): Promise<SaveDialogReturnValue>;
    function showSaveDialog(options: SaveDialogOptions): Promise<SaveDialogReturnValue>;
    function showMessageBox(browserWindow: BrowserWindow, options: MessageBoxOptions): Promise<MessageBoxReturnValue>;
    function showMessageBox(options: MessageBoxOptions): Promise<MessageBoxReturnValue>;
    function showErrorBox(title: string, content: string): void;
  }

  // ========== App ==========

  interface App {
    readonly name: string;
    readonly version: string;
    readonly path: string;
    readonly isPackaged: boolean;

    whenReady(): Promise<void>;
    quit(): void;
    exit(exitCode?: number): void;
    relaunch(options?: { args?: string[]; execPath?: string }): void;
    isReady(): boolean;
    focus(options?: { steal?: boolean }): void;
    hide(): void;
    show(): void;
    getPath(name: 'home' | 'appData' | 'userData' | 'temp' | 'exe' | 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos' | 'logs' | 'crashDumps'): string;
    setPath(name: string, path: string): void;
    getFileIcon(path: string, options?: { size?: 'small' | 'normal' | 'large' }): Promise<NativeImage>;
    getLocale(): string;
    requestSingleInstanceLock(): boolean;
    releaseSingleInstanceLock(): void;

    on(event: 'ready' | 'will-quit' | 'before-quit' | 'quit' | 'window-all-closed' | 'activate' | 'second-instance' | 'browser-window-created', listener: Function): this;
    once(event: string, listener: Function): this;
    removeListener(event: string, listener: Function): this;
    removeAllListeners(event?: string): this;
  }

  interface NativeImage {
    toDataURL(): string;
    toPNG(): Buffer;
    toJPEG(quality: number): Buffer;
    isEmpty(): boolean;
    getSize(): Size;
  }

  // ========== IPC ==========

  interface IpcMain {
    on(channel: string, listener: (event: IpcMainEvent, ...args: unknown[]) => void): this;
    once(channel: string, listener: (event: IpcMainEvent, ...args: unknown[]) => void): this;
    removeListener(channel: string, listener: Function): this;
    removeAllListeners(channel?: string): this;
    handle(channel: string, listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown> | unknown): void;
    handleOnce(channel: string, listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown> | unknown): void;
    removeHandler(channel: string): void;
  }

  interface IpcMainInvokeEvent extends Event {
    readonly sender: WebContents;
    readonly senderId: number;
    readonly frameId: number;
  }

  interface IpcRenderer {
    send(channel: string, ...args: unknown[]): void;
    sendSync(channel: string, ...args: unknown[]): unknown;
    sendTo(webContentsId: number, channel: string, ...args: unknown[]): void;
    invoke(channel: string, ...args: unknown[]): Promise<unknown>;
    on(channel: string, listener: (event: IpcRendererEvent, ...args: unknown[]) => void): this;
    once(channel: string, listener: (event: IpcRendererEvent, ...args: unknown[]) => void): this;
    removeListener(channel: string, listener: Function): this;
    removeAllListeners(channel?: string): this;
    postMessage(channel: string, message: unknown, transfer?: MessagePort[]): void;
  }

  // ========== Notification ==========

  interface NotificationConstructorOptions {
    title?: string;
    subtitle?: string;
    body?: string;
    silent?: boolean;
    icon?: string;
    hasReply?: boolean;
    timeoutType?: 'default' | 'never';
    urgency?: 'normal' | 'critical' | 'low';
    actions?: NotificationAction[];
    closeButtonText?: string;
    toastXml?: string;
  }

  interface NotificationAction {
    type: 'button';
    text: string;
  }

  class Notification {
    constructor(options: NotificationConstructorOptions);
    show(): void;
    close(): void;
    on(event: 'click' | 'show' | 'close' | 'reply' | 'action' | 'failed', listener: Function): this;
    static isSupported(): boolean;
  }

  // ========== Shell ==========

  interface Shell {
    openExternal(url: string, options?: { activate?: boolean; workingDirectory?: string }): Promise<void>;
    openPath(path: string): Promise<string>;
    showItemInFolder(fullPath: string): void;
    beep(): void;
    moveItemToTrash(fullPath: string, deleteOnFail?: boolean): boolean;
    readShortcutLink(shortcutPath: string): ShortcutDetails;
    writeShortcutLink(shortcutPath: string, operation: 'create' | 'update' | 'replace', options: ShortcutDetails): boolean;
  }

  interface ShortcutDetails {
    target: string;
    cwd?: string;
    args?: string;
    description?: string;
    icon?: string;
    iconIndex?: number;
    appUserModelId?: string;
  }

  // ========== Clipboard ==========

  interface Clipboard {
    readText(type?: 'selection' | 'clipboard'): string;
    writeText(text: string, type?: 'selection' | 'clipboard'): void;
    readHTML(type?: 'selection' | 'clipboard'): string;
    writeHTML(markup: string, type?: 'selection' | 'clipboard'): void;
    readImage(type?: 'selection' | 'clipboard'): NativeImage;
    writeImage(image: NativeImage, type?: 'selection' | 'clipboard'): void;
    readBuffer(format: string): Buffer;
    writeBuffer(format: string, buffer: Buffer): void;
    has(format: string, type?: 'selection' | 'clipboard'): boolean;
    availableFormats(type?: 'selection' | 'clipboard'): string[];
    clear(type?: 'selection' | 'clipboard'): void;
  }

  // ========== ContextBridge ==========

  interface ContextBridge {
    exposeInMainWorld(apiKey: string, api: Record<string, unknown>): void;
    exposeInIsolatedWorld(worldId: number, apiKey: string, api: Record<string, unknown>): void;
  }

  // ========== Tray ==========

  class Tray {
    constructor(image: string | NativeImage, guid?: string);
    setImage(image: string | NativeImage): void;
    setToolTip(toolTip: string): void;
    setTitle(title: string, options?: { fontType?: 'monospacedDigit' | 'monospaced' }): void;
    setContextMenu(menu: Menu | null): void;
    setIgnoreDoubleClickEvents(ignore: boolean): void;
    on(event: 'click' | 'right-click' | 'double-click' | 'balloon-show' | 'balloon-click' | 'balloon-closed' | 'drop' | 'drop-files' | 'drop-text', listener: Function): this;
    destroy(): void;
    isDestroyed(): boolean;
  }
}

// ========== 模块声明 ==========

declare module 'electron' {
  export const app: Electron.App;
  export class BrowserWindow extends Electron.BrowserWindow {}
  export const ipcMain: Electron.IpcMain;
  export const ipcRenderer: Electron.IpcRenderer;
  export const dialog: typeof Electron.dialog;
  export class Menu extends Electron.Menu {}
  export class MenuItem extends Electron.MenuItem {}
  export class Notification extends Electron.Notification {}
  export class Tray extends Electron.Tray {}
  export const shell: Electron.Shell;
  export const clipboard: Electron.Clipboard;
  export const contextBridge: Electron.ContextBridge;
  export const screen: {
    getPrimaryDisplay(): { bounds: Electron.Rectangle; size: Electron.Size; workArea: Electron.Rectangle; scaleFactor: number };
    getAllDisplays(): Array<{ bounds: Electron.Rectangle; size: Electron.Size; workArea: Electron.Rectangle; scaleFactor: number }>;
    getDisplayNearestPoint(point: Electron.Point): { bounds: Electron.Rectangle; size: Electron.Size; workArea: Electron.Rectangle; scaleFactor: number };
  };
  export const nativeImage: {
    createFromPath(path: string): Electron.NativeImage;
    createFromBuffer(buffer: Buffer, options?: { width?: number; height?: number; scaleFactor?: number }): Electron.NativeImage;
    createFromDataURL(dataURL: string): Electron.NativeImage;
    createEmpty(): Electron.NativeImage;
  };
  export const globalShortcut: {
    register(accelerator: string, callback: () => void): boolean;
    isRegistered(accelerator: string): boolean;
    unregister(accelerator: string): void;
    unregisterAll(): void;
  };
  export const powerMonitor: {
    on(event: 'suspend' | 'resume' | 'on-ac' | 'on-battery' | 'shutdown' | 'lock-screen' | 'unlock-screen', listener: Function): void;
  };
}
