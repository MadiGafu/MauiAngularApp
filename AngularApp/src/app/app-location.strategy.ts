import { DOCUMENT, HashLocationStrategy, PlatformLocation } from '@angular/common';
import { Injectable, inject } from '@angular/core';

@Injectable()
export class IndexFileHashLocationStrategy extends HashLocationStrategy {
  private readonly document = inject(DOCUMENT);

  constructor(platformLocation: PlatformLocation) {
    super(platformLocation, '');
  }

  override prepareExternalUrl(internal: string): string {
    const currentPath = this.document.location.pathname;
    const indexPath = currentPath.endsWith('/index.html')
      ? currentPath
      : `${currentPath.replace(/\/$/, '')}/index.html`;
    return `${indexPath}${super.prepareExternalUrl(internal)}`;
  }
}
