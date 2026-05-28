export function generateFormKey(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 40);
  const suffix = Math.random().toString(36).substring(2, 6);
  return `${slug}-${suffix}`;
}
