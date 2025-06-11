import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { listAll, ref, StorageReference } from 'firebase/storage';
import { computed, inject } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';

import { ENV, STORAGE } from '@bk2/shared/config';
import { AlbumConfig, AlbumStyle, Image, ImageAction, ImageType } from '@bk2/shared/models';
import { die, getImageType } from '@bk2/shared/util';
import { GalleryEffects, getCategoryName } from '@bk2/shared/categories';

import { newAlbumConfig } from '@bk2/cms/section/util';
import { GalleryModalComponent } from './gallery.modal';

export interface AlbumState {
  config: AlbumConfig;
  currentDirectory: string;
  albumStyle: AlbumStyle;
  images: Image[];
  isLoading: boolean;
  error: string | null;
}

export const initialState: AlbumState = {
  config: newAlbumConfig(),
  currentDirectory: '',
  albumStyle: AlbumStyle.Grid,
  images: [],
  isLoading: false,
  error: null
};

export const AlbumStore = signalStore(
  withState(initialState),
  withProps(() => ({
    env: inject(ENV),
    storage: inject(STORAGE),
    modalController: inject(ModalController)
  })),

  withComputed((state) => {
    return {
      config: computed(() => state.config()),
      currentDirectory: computed(() => state.currentDirectory()),
      albumStyle: computed(() => state.albumStyle()),
      images: computed(() => state.images()),
      isLoading: computed(() => state.isLoading()),
      error: computed(() => state.error()),
      title: computed(() => state.currentDirectory().split('/').pop()),
      currentDirLength: computed(() => state.currentDirectory().split('/').length),
      initialDirLength: computed(() => {
        const _initialDir = state.config().directory;
        return !_initialDir ? 0 : _initialDir.split('/').length;
      }),
      parentDirectory: computed(() => state.currentDirectory().split('/').slice(0, -1).join('/')),
    };
  }),

  withMethods((store) => {
    return {
      /**
       * Updates the current directory which triggers the loading of all its files.
       * @param directory the new currentDirectory
       */
      async setDirectory(currentDirectory?: string) {
        if (currentDirectory) {
          patchState(store, { isLoading: true, error: null });
          patchState(store, { currentDirectory });
          const _images = await this.listAllFilesFromCurrentDirectory();
          patchState(store, { images: _images });
          patchState(store, { isLoading: false });
        }
      },

      setAlbumStyle(albumStyle: AlbumStyle): void {
        patchState(store, { albumStyle });
      },

      setConfig(config?: AlbumConfig): void {
        config ??= newAlbumConfig();
        config.albumStyle ??= AlbumStyle.Grid;
        config.directory ??= 'tenant/' + store.env.owner.tenantId + '/album';
        patchState(store, { config });
        this.setDirectory(config.directory);
        this.setAlbumStyle(config.albumStyle);
      },

      goUp(): void {
        this.setDirectory(store.parentDirectory());
      },

      async listAllFilesFromCurrentDirectory(): Promise<Image[]> {
        const _images: Image[] = [];
        try {
          const _listRef = ref(store.storage, store.currentDirectory());
    
          // listAll returns prefixes (= subdirectories) and items (= files)
          const _result = await listAll(_listRef);
          
          // list all subdirectories in the directory
          _result.prefixes.forEach((_dir) => {
            _images.push(this.getImage(_dir, ImageType.Dir));
          });
      
          // list all files in the directory
          _result.items.forEach((_file) => {
            const _imageType = getImageType(_file.name);
            switch(_imageType) {
              case ImageType.Image:
                _images.push(this.getImage(_file, _imageType));
                break;
              case ImageType.Video:
                if (store.config().showVideos) {
                  _images.push(this.getImage(_file, _imageType));
                }
                break;
              case ImageType.StreamingVideo:
                if (store.config().showStreamingVideos) {
                  _images.push(this.getImage(_file, _imageType));
                }
                break;
              case ImageType.Pdf: 
                if (store.config().showPdfs) {
                  _images.push(this.getImage(_file, _imageType));
                }
                break;
              case ImageType.Doc:
                if (store.config().showDocs) {
                  _images.push(this.getImage(_file, _imageType));
                }
                break;
              case ImageType.Audio:
              default: 
                break;
            }
          });
        }
        catch(_ex) {
          console.error('AlbumStore.listAllFilesFromCurrentDirectory -> error: ', _ex);
        }
        return _images;  
      },

      /**
       * Return a thumbnail representation of the file given based on its mime type.
       * image:  thumbnail image
       * video:  move icon to download the video
       * streaming video: ix-player (bk-video)
       * other:  file icon to download the file
       * @param ref 
       * @param url 
       * @param actionUrl 
       * @returns 
       */
      getImage(ref: StorageReference, imageType: ImageType): Image {
        return {
          imageLabel: ref.name,
          imageType: imageType,
          url: this.getUrl(imageType, ref.name),
          actionUrl: this.getActionUrl(imageType, ref.name),
          altText: (imageType === ImageType.Dir) ? ref.name + ' directory' : ref.name,
          imageOverlay: '',
          fill: imageType === ImageType.Image,
          hasPriority: false,
          imgIxParams: '',
          width: (imageType === ImageType.Image) ? 400 : 100,
          height: (imageType === ImageType.Image) ? 400 : 100,
          sizes: '(max-width: 786px) 50vw, 100vw',
          borderRadius: 4,
          imageAction: this.getImageAction(imageType),
          zoomFactor: 2,
          isThumbnail: false,
          slot: 'icon-only'
        };
      },

      getImageAction(imageType: ImageType): ImageAction {
        switch(imageType) {
          case ImageType.Image: return ImageAction.OpenSlider;
          case ImageType.Pdf:
          case ImageType.Audio:
          case ImageType.Doc:
          case ImageType.Video: return ImageAction.Download;
          case ImageType.Dir: return ImageAction.OpenDirectory;
          default: return ImageAction.None;
        }
      },
    
      getUrl(imageType: ImageType, fileName: string): string {
        switch(imageType) {
          case ImageType.Image: return store.currentDirectory() + '/' + fileName;
          case ImageType.Video: return 'logo/filetypes/video.svg';
          case ImageType.StreamingVideo: return store.env.app.imgixBaseUrl + '/' + store.currentDirectory() + '/' + fileName;
          case ImageType.Audio: return 'logo/filetypes/audio.svg';
          case ImageType.Pdf: return store.currentDirectory() + '/' + fileName;
          case ImageType.Doc: return 'logo/filetypes/doc.svg';
          case ImageType.Dir: return 'logo/filetypes/folder.svg';
          default: return 'logo/filetypes/file.svg';
        }
      },
    
      getActionUrl(imageType: ImageType, fileName: string): string {
        const _downloadUrl = store.env.app.imgixBaseUrl + '/' + store.currentDirectory() + '/' + fileName;
        switch(imageType) {
          case ImageType.Video: 
          case ImageType.Audio:
          case ImageType.Doc:
          case ImageType.Pdf: return _downloadUrl;
          case ImageType.Dir: return store.currentDirectory() + '/' + fileName;
          default: return '';
        }
      },

      async openGallery(files: Image[], title = '', initialSlide = 0): Promise<void> {
        const _images = files.filter((file) => file.imageType === ImageType.Image);
        const _effect = store.config().galleryEffect ?? die('AlbumSectionStore.openGallery: gallery effect is mandatory.');
        const _modal = await store.modalController.create({
          component: GalleryModalComponent,
          cssClass: 'full-modal',
          componentProps: {
            imageList: _images,
            initialSlide: initialSlide,
            title: title,
            effect: getCategoryName(GalleryEffects, _effect)
          }
        });
        _modal.present();
    
        await _modal.onWillDismiss();
      }
    }
  })
);
