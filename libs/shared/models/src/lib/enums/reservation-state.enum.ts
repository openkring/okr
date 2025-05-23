export enum ReservationState {
  Initial,
  Applied,    // to be confirmed
  Active,     // confirmed, next: pay and execute
  Completed,    // paid and executed
  Cancelled,
  Denied
}