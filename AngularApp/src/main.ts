import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));

//  Получение сообщений от MAUI
(window as any).receiveMessage = (msg: string) => {
  console.log("Получено из MAUI:", msg);
  alert("MAUI сказал: " + msg);
};

// Отправка сообщений в MAUI
(window as any).sendToMaui = (msg: string) => {
  window.location.href = "maui://" + encodeURIComponent(msg);
};
