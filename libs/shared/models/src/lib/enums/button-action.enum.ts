export enum ButtonAction {
  Download, // download referenced file from Firebase storage
  Navigate, // navigate to a new page (url must be a valid route)
  Browse, // browse to an external URL
  Zoom, // show a zoomed version of the referenced file in Firebase storage (typically an image)
  None,
  Notify, // notify parent component (typically the page about the click on the button)
  // NB numeric enum: ButtonActionConfig.type is STORED as the number, so a value may only
  // ever be APPENDED. Inserting one renumbers every later value and silently re-points
  // every button document already in the database.
  Workflow, // fire a workflow event (ui.buttonClicked); the consequence is configured as a rule
}
