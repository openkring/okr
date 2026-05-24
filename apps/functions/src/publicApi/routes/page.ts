import { Request, Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { setCacheHeaders } from '../utils';

const IMGIX_BASE = 'https://bkaiser.imgix.net';

function toImgixUrl(path: string): string {
  if (!path) return '';
  if (/^https?:\/\//.test(path)) return path;
  return `${IMGIX_BASE}/${path}?auto=compress,format=jpg`;
}

type I18nString = Record<string, string>;

function pickI18n(value: I18nString | undefined, fallback = ''): string {
  if (!value) return fallback;
  return value['de'] ?? value['en'] ?? Object.values(value)[0] ?? fallback;
}

interface StoredImage { url?: string; altText?: string; label?: string }

function mapImage(img: StoredImage | undefined): { url: string; alt: string } | undefined {
  if (!img?.url) return undefined;
  return { url: toImgixUrl(img.url), alt: img.altText ?? img.label ?? '' };
}

interface SectionDoc {
  type?: string;
  title?: string;
  subTitle?: string;
  content?: { htmlContent?: string };
  properties?: Record<string, unknown> & {
    titleI18n?: I18nString;
    subTitleI18n?: I18nString;
    contentI18n?: I18nString;
  };
  isArchived?: boolean;
}

function mapSection(s: SectionDoc, nestedSections: Map<string, SectionDoc>): unknown {
  const type = s.type ?? 'article';
  const props = (s.properties ?? {}) as Record<string, unknown>;
  const title = pickI18n(props['titleI18n'] as I18nString | undefined, s.title ?? '');
  const subTitle = pickI18n(props['subTitleI18n'] as I18nString | undefined, s.subTitle ?? '');
  const articleHtml = pickI18n(props['contentI18n'] as I18nString | undefined, s.content?.htmlContent ?? '');

  switch (type) {
    case 'hero': {
      const heroImg = mapImage(props['hero'] as StoredImage | undefined);
      const logoImg = mapImage(props['logo'] as StoredImage | undefined);
      return { type: 'hero', title, subTitle, content: articleHtml, background: heroImg, logo: logoImg };
    }

    case 'table': {
      const body = ((props['data'] as { body?: string[] } | undefined)?.body ?? []);
      const rows: { label: string; value: string }[] = [];
      for (let i = 0; i + 1 < body.length; i += 2) {
        rows.push({ label: body[i], value: body[i + 1] });
      }
      return { type: 'table', title, subTitle, rows };
    }

    case 'album': {
      const images = ((props['images'] as StoredImage[] | undefined) ?? [])
        .map(mapImage)
        .filter((i): i is { url: string; alt: string } => !!i);
      return { type: 'album', title, subTitle, images };
    }

    case 'button': {
      const style = (props['style'] as { label?: string; color?: string } | undefined) ?? {};
      const action = (props['action'] as { url?: string } | undefined) ?? {};
      return {
        type: 'button',
        title,
        label: style.label ?? title,
        url: action.url ?? '',
        color: style.color ?? 'primary',
      };
    }

    case 'iframe': {
      return {
        type: 'iframe',
        title,
        url: (props['url'] as string | undefined) ?? '',
        style: (props['style'] as string | undefined) ?? '',
      };
    }

    case 'video': {
      const raw = (props['url'] as string | undefined) ?? '';
      const base = (props['baseUrl'] as string | undefined) ?? 'https://www.youtube.com/embed/';
      const url = /^https?:\/\//.test(raw) ? raw : (raw ? base + raw : '');
      return { type: 'video', title, url };
    }

    case 'people': {
      const persons = ((props['persons'] as { key?: string; name1?: string; name2?: string; label?: string }[] | undefined) ?? [])
        .map(p => ({
          key: p.key ?? '',
          firstName: p.name1 ?? '',
          lastName: p.name2 ?? '',
          label: p.label ?? '',
        }));
      return { type: 'people', title, subTitle, persons };
    }

    case 'accordion': {
      const items = ((props['items'] as { key?: string; label?: string }[] | undefined) ?? [])
        .map(it => {
          const nested = it.key ? nestedSections.get(it.key) : undefined;
          const nestedProps = (nested?.properties ?? {}) as { contentI18n?: I18nString };
          const content = nested
            ? pickI18n(nestedProps.contentI18n, nested.content?.htmlContent ?? '')
            : '';
          return { label: it.label ?? '', content };
        });
      return { type: 'accordion', title, subTitle, items };
    }

    case 'article':
    default:
      return { type: 'article', title, subTitle, content: articleHtml };
  }
}

export async function pageRouter(req: Request, res: Response): Promise<void> {
  const tenantId = (req.query['tenantId'] as string)?.trim();
  if (!tenantId) {
    res.status(400).json({ error: { code: 'validation_error', message: 'Missing tenantId' } });
    return;
  }

  const pageKey = req.params['pageKey'] as string;

  try {
    const db = getFirestore();

    const pageDoc = await db.collection('pages').doc(pageKey).get();
    if (!pageDoc.exists) {
      res.status(404).json({ error: { code: 'not_found', message: 'Page not found' } });
      return;
    }

    const pageData = pageDoc.data()!;
    if (!pageData['tenants']?.includes(tenantId) || pageData['isArchived'] === true) {
      res.status(404).json({ error: { code: 'not_found', message: 'Page not found' } });
      return;
    }

    const banner = pageData['bannerUrl']
      ? { url: toImgixUrl(pageData['bannerUrl']), alt: pageData['bannerAltText'] ?? '' }
      : undefined;
    const pageEnvelope = {
      title: pageData['title'] ?? '',
      subTitle: pageData['subTitle'] ?? '',
      abstract: pageData['abstract'] ?? '',
      banner,
    };

    const rawKeys: string[] = pageData['sections'] ?? [];
    const sectionKeys = rawKeys.map(k => k.replace('@TID@', tenantId));

    if (sectionKeys.length === 0) {
      setCacheHeaders(res);
      res.json({ ...pageEnvelope, sections: [] });
      return;
    }

    const sectionRefs = sectionKeys.map(k => db.collection('sections').doc(k));
    const sectionDocs = await db.getAll(...sectionRefs);
    const liveSections = sectionDocs
      .filter(d => d.exists && d.data()?.['isArchived'] !== true)
      .map(d => d.data() as SectionDoc);

    const nestedKeys = new Set<string>();
    for (const s of liveSections) {
      if (s.type === 'accordion') {
        const items = ((s.properties?.['items'] as { key?: string }[] | undefined) ?? []);
        for (const it of items) {
          if (it.key) nestedKeys.add(it.key.replace('@TID@', tenantId));
        }
      }
    }

    const nestedSections = new Map<string, SectionDoc>();
    if (nestedKeys.size > 0) {
      const nestedRefs = Array.from(nestedKeys).map(k => db.collection('sections').doc(k));
      const nestedDocs = await db.getAll(...nestedRefs);
      for (const d of nestedDocs) {
        if (d.exists) nestedSections.set(d.id, d.data() as SectionDoc);
      }
    }

    const sections = liveSections.map(s => mapSection(s, nestedSections));

    setCacheHeaders(res);
    res.json({ ...pageEnvelope, sections });
  } catch (err) {
    logger.error('publicApi /pages error', { tenantId, pageKey, err });
    res.status(500).json({ error: { code: 'internal_error', message: 'Failed to fetch page' } });
  }
}
