import { Component, OnInit, NgZone, inject } from '@angular/core';
import { PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

declare global {
  interface Window {
    receiveMessage?: (msg: string) => void;
    sendToMaui?: (jsonBase64: string) => void;
    angularReceiveStructured?: (base64: string) => void;
  }
}

type Msg =
  | { type: 'ping'; id: string; payload?: any }
  | { type: 'pong'; id: string; payload: { serverTime: string } }
  | { type: 'getDevice'; id: string }
  | { type: 'deviceInfo'; id: string; payload: { platform: string; osVersion?: string } }
  | { type: 'notify'; id?: string; payload: { text: string } };

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.html',
})
export class AppComponent implements OnInit {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  messages: string[] = [];

  constructor(private zone: NgZone) {}

  ngOnInit(): void {
    if (!this.isBrowser) return;

    // MAUI -> Angular (простой текст)
    window.receiveMessage = (text: string) => {
      this.zone.run(() => this.messages.push(`из MAUI: ${text}`));
      console.log('[Angular] из MAUI:', text);
    };

    // Angular -> MAUI (base64(JSON)) + fallback на схему
    window.sendToMaui ??= (base64: string) => {
      window.location.href = 'maui://' + encodeURIComponent(base64);
     
    };

    // ВАЖНО: регистрируем структурированный приём ТОЛЬКО в браузере
    window.angularReceiveStructured = (base64: string) => {
      this.angularReceiveStructured(base64);
    };
  }

  // ===== helpers =====
  private toBase64(obj: any): string {
    const json = JSON.stringify(obj);
    return btoa(unescape(encodeURIComponent(json)));
  }
  private uid(): string {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  // ===== демо-операции =====
  sendPing(): void {
    const msg: Msg = { type: 'ping', id: this.uid() };
    this.messages.push(`в MAUI: ping (${msg.id})`);
    window.sendToMaui?.(this.toBase64(msg));
  }

  requestDeviceInfo(): void {
    const msg: Msg = { type: 'getDevice', id: this.uid() };
    this.messages.push(`в MAUI: getDevice (${msg.id})`);
    window.sendToMaui?.(this.toBase64(msg));
  }

  // Приём структурированных ответов из MAUI
  angularReceiveStructured = (base64: string) => {
    try {
      const json = decodeURIComponent(escape(atob(base64)));
      const data = JSON.parse(json) as Msg;

      this.zone.run(() => {
        if (data.type === 'pong') {
          this.messages.push(`из MAUI: pong (${data.id}) @ ${data.payload.serverTime}`);
        } else if (data.type === 'deviceInfo') {
          this.messages.push(`из MAUI: device=${data.payload.platform} ${data.payload.osVersion ?? ''}`.trim());
        } else if (data.type === 'notify') {
          this.messages.push(`из MAUI[notify]: ${data.payload.text}`);
        } else {
          this.messages.push(`из MAUI[unknown]: ${json}`);
        }
      });
    } catch (e) {
      console.error('angularReceiveStructured parse error:', e);
    }
  };
}

// Экспорт, если в main.ts ожидается { App }
export const App = AppComponent;
