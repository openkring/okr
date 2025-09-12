/**
 * Defines the behaviour of components that show a set of items (e.g. list, gallery, grid):
 * browse: gallery is browsable, no further actions provided
 * fullscreen: a click on an image opens a galleria in fullscreen mode
 * single: one single item can be selected with a click on it
 * multi: the gallery provides a selection mode. several items can be
 * selected and actions in the side menu can be applied on the selection.
 */
export enum GalleryLayoutType {
  Browse,
  Single,
  FullScreen,
  Multi,
}
