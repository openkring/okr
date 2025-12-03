import { inject, Pipe, PipeTransform } from '@angular/core';
import { ENV } from '@bk2/shared-config';
import { fileExtension, reduceLogoName } from '@bk2/shared-util-core';

@Pipe({
  name: 'fileLogo',
  standalone: true
})
export class FileLogoPipe implements PipeTransform {
  private readonly env = inject(ENV);

  transform(fullPath: string): string {
    const ext = fileExtension(fullPath);
    const logoName = reduceLogoName(ext);
    return getFileLogoUrl(this.env.services.imgixBaseUrl, logoName);
  }
}

export function getFileLogoUrl(imgixBaseUrl: string, iconName: string): string {
  return `${imgixBaseUrl}/logo/filetypes/${iconName}.svg`;
} 
