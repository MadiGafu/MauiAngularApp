import { Component, OnInit, NgZone, inject } from '@angular/core';
import { PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms'; 


declare global {
  interface Window {
    receiveMessage?: (msg: string) => void;           // простой текст из MAUI
    angularReceiveStructured?: (b64: string) => void; // структурированные ответы из MAUI
    __IS_MAUI_WEBVIEW__?: boolean;                    // MAUI ставит флаг после загрузки
  }
}

type Msg =
  | { type: 'ping'; id: string }
  | { type: 'pong'; id: string; payload: { serverTime: string } }
  | { type: 'getDevice'; id: string }
  | { type: 'deviceInfo'; id: string; payload: { platform: string; osVersion?: string } }
  | { type: 'notify'; id?: string; payload: { text: string } };

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.html',
  imports: [FormsModule],

})
export class AppComponent implements OnInit {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  // UI state
  messages: string[] = [];
  isMauiWebView = false;
  lastPong?: string;
  deviceInfo?: { platform: string; osVersion?: string };
  customText = '';

  constructor(private zone: NgZone) {}

  ngOnInit(): void {
    if (!this.isBrowser) return;

    this.isMauiWebView = !!window.__IS_MAUI_WEBVIEW__;

    // Простой текст от MAUI
    window.receiveMessage = (text: string) => {
      this.zone.run(() => {
        this.messages.push(`из MAUI[notify]: ${text}`);
        this.isMauiWebView ||= !!window.__IS_MAUI_WEBVIEW__;
      });
    };

    // Структурированные ответы от MAUI (MAUI шлёт base64 стандартный)
    window.angularReceiveStructured = (b64: string) => {
      try {
        const json = decodeURIComponent(escape(atob(b64)));
        const data = JSON.parse(json) as Msg;
        this.zone.run(() => this.onStructured(data));
      } catch (e) {
        console.error('decode structured error:', e);
      }
    };
  }

  // ===== Actions =====
  ping(): void {
    const msg: Msg = { type: 'ping', id: this.uid() } as Msg;
    this.messages.push(`в MAUI: ping (${msg.id})`);
    this.sendStructured(msg);
  }

  getDevice(): void {
    const msg: Msg = { type: 'getDevice', id: this.uid() } as Msg;
    this.messages.push(`в MAUI: getDevice (${msg.id})`);
    this.sendStructured(msg);
  }

  sendCustom(): void {
    const text = (this.customText || '').trim();
    if (!text) return;
    const msg: Msg = { type: 'notify', payload: { text } } as Msg;
    this.messages.push(`в MAUI: notify "${text}"`);
    this.sendStructured(msg);
    this.customText = '';
  }

  clearLog(): void {
    this.messages = [];
    this.lastPong = undefined;
  }

  // ===== Handle structured from MAUI =====
  private onStructured(data: Msg) {
    if (data.type === 'pong') {
      this.lastPong = data.payload.serverTime;
      this.messages.push(`из MAUI: pong (${data.id}) @ ${data.payload.serverTime}`);
    } else if (data.type === 'deviceInfo') {
      this.deviceInfo = { platform: data.payload.platform, osVersion: data.payload.osVersion };
      this.messages.push(`из MAUI: device=${data.payload.platform} ${data.payload.osVersion ?? ''}`.trim());
    } else if (data.type === 'notify') {
      this.messages.push(`из MAUI[notify]: ${data.payload.text}`);
    } else {
      this.messages.push(`из MAUI[unknown]: ${JSON.stringify(data)}`);
    }
  }

  // ===== Bridge (host-based base64url) =====
  private sendStructured(obj: any) {
    if (!this.isBrowser) return;
    const base64url = this.toBase64Url(obj);
    // payload в host: maui://<base64url>
    window.location.href = 'maui://' + encodeURIComponent(base64url);
  }

  private toBase64Url(obj: any): string {
    const json = JSON.stringify(obj);
    const b64 = btoa(unescape(encodeURIComponent(json)));
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  private uid(): string {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

// экспорт для main.ts при необходимости
export const App = AppComponent;
