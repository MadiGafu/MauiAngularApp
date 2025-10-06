import { Component, OnInit, NgZone, inject } from '@angular/core';
import { PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';

declare global {
  interface Window {
    __IS_MAUI_WEBVIEW__?: boolean;
    receiveMessage?: (msg: string) => void;
    angularReceiveStructured?: (b64: string) => void;
  }
}

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.html',
  imports: [RouterModule, FormsModule],
})
export class AppComponent implements OnInit {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  env = 'Browser tab';
  messages: string[] = [];

  constructor(private zone: NgZone) {}

  ngOnInit(): void {
    if (!this.isBrowser) return;
    this.env = window.__IS_MAUI_WEBVIEW__ ? 'MAUI WebView' : 'Browser tab';

    // Простой канал уведомлений из MAUI (оставляем для нативных ответов)
    window.receiveMessage = (text: string) => {
      this.zone.run(() => this.messages.push(`из MAUI: ${text}`));
    };

    // Структурированные ответы из MAUI (понадобится для нативного save/open и т.д.)
    window.angularReceiveStructured = (b64: string) => {
      try {
        const json = decodeURIComponent(escape(atob(b64)));
        const data = JSON.parse(json);
        this.zone.run(() => this.messages.push(`из MAUI[data]: ${data.type || 'unknown'}`));
      } catch {}
    };
  }
}

export const App = AppComponent;
