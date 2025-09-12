import { inject, Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Pipe({ 
  name: 'safe',
  standalone: true
})
export class SafePipe implements PipeTransform {
  private readonly domSanitizer = inject(DomSanitizer);

transform(url: string): SafeResourceUrl {
  return this.domSanitizer.bypassSecurityTrustResourceUrl(url);
}
}