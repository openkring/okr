import { Request, Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { locationName, parseTags, storeDateToIso } from '../utils';

// ---------------------------------------------------------------------------
// Public photo galleries (brunokaiser.ch).
//
// The static site holds the STRUCTURE (which topics exist, which galleries sit
// under them, in which order) and asks this route only for the IMAGES of one
// gallery. That split keeps the layout stable no matter how many photos a
// folder holds, and it means uploading in bka-app is enough — no redeploy.
//
// SECURITY: this endpoint is unauthenticated and `docs` also carries business,
// HR and finance documents. A folder is therefore NOT public because someone
// links to it — it is public only when it carries the `public` tag. Everything
// else 404s. `fullPath` is the only file reference returned; the site appends
// the imgix parameters itself, so changing the layout never touches this code.
// ---------------------------------------------------------------------------

const PUBLIC_TAG = 'public';
const MAX_IMAGES = 500;

/** Galleries change rarely; a long shared cache keeps the Firestore reads low. */
function setGalleryCacheHeaders(res: Response): void {
  res.set('Cache-Control', 'public, max-age=600, stale-while-revalidate=3600');
}

interface FolderDoc {
  name: string;
  title: string;
  description: string;
  tags: string;
  tenants: string[];
  isArchived: boolean;
  index: number;
}

interface DocumentDoc {
  fullPath: string;
  title: string;
  description: string;
  altText: string;
  credit: string;
  mimeType: string;
  tags: string;
  folderKeys: string[];
  locationKey: string;
  dateOfDocCreation: string;
  tenants: string[];
  isArchived: boolean;
  index: number;
}

interface GalleryImage {
  path: string;
  title: string;
  description: string;
  altText: string;
  credit: string;
  location: string;
  date: string;
  tags: string[];
}

function hasPublicTag(tags: string): boolean {
  return parseTags(tags).includes(PUBLIC_TAG);
}

/** Only real images — a folder may also hold a PDF or a text file. */
function isImage(mimeType: string, fullPath: string): boolean {
  if (mimeType.startsWith('image/')) return true;
  return /\.(jpe?g|png|webp|avif|gif|tiff?)$/i.test(fullPath);
}

function toImage(d: DocumentDoc): GalleryImage {
  return {
    path: d.fullPath ?? '',
    title: d.title ?? '',
    description: d.description ?? '',
    altText: d.altText || d.title || '',
    credit: d.credit ?? '',
    location: locationName(d.locationKey ?? ''),
    date: storeDateToIso(d.dateOfDocCreation ?? ''),
    tags: parseTags(d.tags ?? ''),
  };
}

/**
 * Resolve a folder by its `name` (the slug used in the URL) within one tenant.
 * `name` is not guaranteed unique by the data model, so the newest matching
 * public folder wins deterministically via `index`, and a collision is logged.
 */
async function findPublicFolder(tenantId: string, slug: string) {
  const db = getFirestore();
  const snap = await db.collection('folders')
    .where('tenants', 'array-contains', tenantId)
    .where('name', '==', slug)
    .where('isArchived', '==', false)
    .get();

  const candidates = snap.docs.filter((doc) => hasPublicTag((doc.data() as FolderDoc).tags ?? ''));
  if (candidates.length === 0) return null;
  if (candidates.length > 1) {
    logger.warn('publicApi /gallery ambiguous folder name', { tenantId, slug, count: candidates.length });
  }
  candidates.sort((a, b) => ((a.data() as FolderDoc).index ?? 0) - ((b.data() as FolderDoc).index ?? 0));
  return candidates[0];
}

/**
 * GET /gallery?tenantId=bka&folder=<slug>
 * -> { folder: { slug, name, title, description }, images: GalleryImage[] }
 *
 * GET /gallery?tenantId=bka
 * -> { folders: [{ slug, title, description, count }] }  — the index used for
 *    the gallery counters on the home and topic pages.
 */
export async function galleryRouter(req: Request, res: Response): Promise<void> {
  const tenantId = (req.query['tenantId'] as string)?.trim();
  if (!tenantId) {
    res.status(400).json({ error: { code: 'validation_error', message: 'Missing tenantId' } });
    return;
  }
  const slug = (req.query['folder'] as string | undefined)?.trim() ?? '';

  try {
    if (!slug) {
      await respondWithIndex(tenantId, res);
      return;
    }

    const folderDoc = await findPublicFolder(tenantId, slug);
    if (!folderDoc) {
      res.status(404).json({ error: { code: 'not_found', message: 'Unknown gallery' } });
      return;
    }
    const folder = folderDoc.data() as FolderDoc;

    const db = getFirestore();
    const snap = await db.collection('docs')
      .where('tenants', 'array-contains', tenantId)
      .where('folderKeys', 'array-contains', folderDoc.id)
      .where('isArchived', '==', false)
      .get();

    const images = snap.docs
      .map((doc) => doc.data() as DocumentDoc)
      .filter((d) => isImage(d.mimeType ?? '', d.fullPath ?? ''))
      .filter((d) => !!d.fullPath)
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .slice(0, MAX_IMAGES)
      .map(toImage);

    setGalleryCacheHeaders(res);
    res.json({
      folder: {
        slug: folder.name ?? slug,
        title: folder.title ?? '',
        description: folder.description ?? '',
      },
      images,
    });
  } catch (err) {
    logger.error('publicApi /gallery error', { tenantId, slug, err });
    res.status(500).json({ error: { code: 'internal_error', message: 'Failed to fetch gallery' } });
  }
}

/**
 * Counts for every public folder of the tenant, in one pass. Uses aggregation
 * counts so the payload stays small even when a folder holds hundreds of photos.
 */
async function respondWithIndex(tenantId: string, res: Response): Promise<void> {
  const db = getFirestore();
  const snap = await db.collection('folders')
    .where('tenants', 'array-contains', tenantId)
    .where('isArchived', '==', false)
    .get();

  const publicFolders = snap.docs.filter((doc) => hasPublicTag((doc.data() as FolderDoc).tags ?? ''));

  const folders = await Promise.all(publicFolders.map(async (doc) => {
    const f = doc.data() as FolderDoc;
    const agg = await db.collection('docs')
      .where('tenants', 'array-contains', tenantId)
      .where('folderKeys', 'array-contains', doc.id)
      .where('isArchived', '==', false)
      .count()
      .get();
    return {
      slug: f.name ?? '',
      title: f.title ?? '',
      description: f.description ?? '',
      count: agg.data().count,
    };
  }));

  folders.sort((a, b) => a.slug.localeCompare(b.slug));

  setGalleryCacheHeaders(res);
  res.json({ folders });
}
