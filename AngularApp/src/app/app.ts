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
  env = 'Webový prohlížeč';
  messages: string[] = [];

  constructor(private zone: NgZone) {}

  ngOnInit(): void {
    if (!this.isBrowser) return;
    const isMauiWebView =
      window.__IS_MAUI_WEBVIEW__ ||
      window.location.protocol === 'file:' ||
      window.location.hostname === 'appassets.example';
    this.env = isMauiWebView ? 'Aplikace MAUI' : 'Webový prohlížeč';

    window.receiveMessage = (text: string) => {
      this.zone.run(() => this.messages.push(`Z MAUI: ${text}`));
    };

    window.angularReceiveStructured = (b64: string) => {
      try {
        const json = decodeURIComponent(escape(atob(b64)));
        const data = JSON.parse(json);
        this.zone.run(() => this.messages.push(`Z MAUI [${data.type || 'neznámý typ'}]`));
      } catch (error) {
        console.error('Nepodařilo se zpracovat zprávu z MAUI.', error);
      }
    };
  }
}

export const App = AppComponent;
