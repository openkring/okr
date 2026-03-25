export enum ButtonAction {
  Download, // download referenced file from Firebase storage
  Navigate, // navigate to a new page (url must be a valid route)
  Browse, // browse to an external URL
  Zoom, // show a zoomed version of the referenced file in Firebase storage (typically an image)
  None,
  Notify, // notify parent component (typically the page about the click on the button)
}
