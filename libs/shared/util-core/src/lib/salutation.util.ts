/** Greeting for a person: Liebe / Lieber only where the gender is known as female / male, otherwise neutral. */
export function personGreeting(firstName: string, gender: string | undefined): string {
  if (!firstName) return 'Guten Tag';
  if (gender === 'female') return `Liebe ${firstName}`;
  if (gender === 'male') return `Lieber ${firstName}`;
  return `Guten Tag ${firstName}`;
}
