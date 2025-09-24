import { Component, OnInit, NgZone, inject } from '@angular/core';
import { PLATFORM_ID, isDevMode } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

declare global {
  interface Window {
    receiveMessage?: (msg: string) => void;
    sendToMaui?: (msg: string) => void;
    __IS_MAUI_WEBVIEW__?: boolean; // выставим из MAUI (см. пункт 2)
  }
}

type BridgeMsg =
  | { type: 'fromMaui'; msg: string; sender: string }
  | { type: 'toMaui';   msg: string; sender: string };

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.html',
})
export class AppComponent implements OnInit {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private chan?: BroadcastChannel;
  private readonly instanceId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  private readonly useBridge = true; // можно выключить если не нужно зеркалирование

  messages: string[] = [];

  constructor(private zone: NgZone) {}

  ngOnInit(): void {
    if (!this.isBrowser) return;

    // --- DEV мост между вкладками/вебвью на одном origin ---
    if (this.useBridge && typeof BroadcastChannel !== 'undefined') {
      this.chan = new BroadcastChannel('maui-dev');
      this.chan.onmessage = (e: MessageEvent<BridgeMsg>) => this.onBridgeMessage(e.data);
    }
    // Fallback: если нет BroadcastChannel (редко), используем storage-события
    window.addEventListener('storage', (e) => {
      if (e.key === '__maui_bridge__' && e.newValue) {
        try { this.onBridgeMessage(JSON.parse(e.newValue) as BridgeMsg); } catch {}
      }
    });

    // --- Приём из MAUI (только в WebView реально прилетает) ---
    window.receiveMessage = (msg: string) => {
      this.zone.run(() => this.messages.push(`из MAUI: ${msg}`));
      // зеркалим в другие вкладки/вебвью (чтобы localhost всё видел)
      this.broadcast({ type: 'fromMaui', msg, sender: this.instanceId });
      console.log('[Angular] из MAUI:', msg);
    };

    // --- Отправка в MAUI (fallback через maui://) ---
    if (!window.sendToMaui) {
      window.sendToMaui = (msg: string) => {
        window.location.href = 'maui://' + encodeURIComponent(msg);
      };
    }
  }

  sendToMaui(): void {
    const text = `Привет из Angular ${new Date().toLocaleTimeString()}`;
    this.messages.push(`в MAUI: ${text}`);
    // локально пытаемся отправить
    if (this.isBrowser) {
      try { window.sendToMaui?.(text); } catch (e) { console.error('sendToMaui error:', e); }
    }
    // и параллельно транслируем в другие клиенты (чтобы WebView тоже отреагировал)
    this.broadcast({ type: 'toMaui', msg: text, sender: this.instanceId });
  }

  clearMessages(): void { this.messages = []; }

  // --------- DEV bridge helpers ----------
  private onBridgeMessage(data: BridgeMsg) {
    if (!data || (data as any).sender === this.instanceId) return;
    if (!this.isBrowser) return;

    if (data.type === 'fromMaui') {
      // зеркалим «из MAUI» в браузерной вкладке
      this.zone.run(() => this.messages.push(`из MAUI: ${data.msg}`));
    } else if (data.type === 'toMaui') {
      // если мы внутри MAUI WebView → реально отправим в MAUI
      if (window.__IS_MAUI_WEBVIEW__) {
        this.zone.run(() => this.messages.push(`в MAUI: ${data.msg} (из браузера)`));
        try { window.sendToMaui?.(data.msg); } catch {}
      } else {
        // обычная вкладка просто логирует
        this.zone.run(() => this.messages.push(`(зеркало) в MAUI: ${data.msg}`));
      }
    }
  }

  private broadcast(msg: BridgeMsg) {
    if (!this.useBridge) return;
    if (this.chan) {
      this.chan.postMessage(msg);
    } else {
      // storage fallback
      localStorage.setItem('__maui_bridge__', JSON.stringify(msg));
    }
  }
}

// Экспорт для импорта { App } в main.ts / main.server.ts
export const App = AppComponent;
