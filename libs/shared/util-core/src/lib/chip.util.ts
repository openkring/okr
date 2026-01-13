
/**
 * Chips is the generic implementation of any list of predefined strings, e.g. tags, roles.
 * Conventions:
 * 
 * Users can select any chip from the available chips.
 * Selected chips are stored in the database as a list of chip names (string[]).
 * Chip names are translated if they start with a @.
 */

export function getNonSelectedChips(availableChips: string[], selectedChips: string[]): string[] {
  const selectedLower = selectedChips.map(chip => chip.toLowerCase());
  return availableChips.filter(chip => !selectedLower.includes(chip.toLowerCase()));
}

/**
 * This method can be used as a compare method in filters.
 * @param storedChips the value from the database, consisting of a comma-separated list of chip names 
 * @param selectedChip the chip to be checked for
 * @returns true if selectedChip is either undefined or matches the storedChips
 */
export function chipMatches(storedChips: string, selectedChip: string | undefined | null): boolean {
  if (selectedChip === undefined || selectedChip === null || selectedChip.length === 0) return true; // no filter
  if (!storedChips || storedChips.length === 0) return false; // no stored chips
  return storedChips.toLowerCase().includes(selectedChip.toLowerCase());
}


