import { Component, CUSTOM_ELEMENTS_SCHEMA, input } from '@angular/core';

/**
 * This video player component is based on imgix's ix-player.
 * See:
 *    imgix Video API: https://www.imgix.com/solutions/video-api
 *    ix-player reference: https://github.com/imgix/ix-elements/blob/main/packages/ix-player/REFERENCE.md
 *    Video player tutorial: https://docs.imgix.com/getting-started/tutorials/performance-and-metadata/creating-a-user-friendly-video-player
 * 
 * Videos should be able to be uploaded in different formats (e.g. mov, mp4, webm) and resolutions. Imgix would then 
 * automatically and one-time convert the video to HLS format. However, I could not get this to work.
 * That's why I'm using a manual conversion to HLS format with ffmpeg.
 * 
 * Videos can be directly streamed from Firebase storage in HLS format (e.g. via GallerySection or AlbumSection).
 * To generate the HLS formats:
 * ffmpeg -i filename.mov -codec: copy -hls_time 10 -hls_list_size 0 -f hls filename.m3u8
 * upload all generated files *.m3u8 and *.ts into a subdirectory called videos.
 * The Videos are shown at the top of the album section, followed by the images.
 */

@Component({
    selector: 'bk-video',
    imports: [
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    styles: [`
      ix-player { display:block; width:100%; margin: 1rem 0 2rem; background-color: #000; line-height: 0;}
      ix-player:not([audio]) { aspect-ratio: 16/9; }
    `],
    template: `
      <ix-player
        [src]="url() + '?ixembed=docs&fm=hls'"
        type="hls"
        gif-preview
        poster-params="video-thumbnail-time=2">
      </ix-player>
    `
  })
  export class VideoComponent {
    public url = input.required<string>();
  }
