import { BookingLineModel } from '@bk2/shared-models';

export function validateBookingBalance(lines: BookingLineModel[]): boolean {
  let debitTotal = 0;
  let creditTotal = 0;
  for (const line of lines) {
    debitTotal  += line.debitAmount?.amount  ?? 0;
    creditTotal += line.creditAmount?.amount ?? 0;
  }
  return debitTotal === creditTotal;
}

export function generateBookingNo(year: number, sequence: number): string {
  return `${year}-${String(sequence).padStart(6, '0')}`;
}
