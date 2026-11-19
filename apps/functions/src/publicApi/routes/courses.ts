import { Request, Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import type { CalEventModel } from '@okr/shared-models';
import { filterCoursesByAudience, parseAudienceParam, toPublicCourse } from '@okr/shared-util-core';
import { todayStoreDate } from '../../calendar/recipients';
import { readAnnouncedCourses } from '../../forms/course-choice';

/**
 * GET /courses — the announced courses of a tenant with their public dates (spec 1.166 §5).
 * Same course rule as the Anmeldung (`readAnnouncedCourses`). Archived / unfixed dates are
 * filtered in code by `toPublicCourse`: Firestore reads skip model defaults, so an
 * `isArchived == false` query would drop events written without the field.
 */
export async function coursesRouter(req: Request, res: Response): Promise<void> {
  const tenantId = (req.query['tenantId'] as string)?.trim();
  if (!tenantId) {
    res.status(400).json({ error: { code: 'validation_error', message: 'Missing tenantId' } });
    return;
  }

  try {
    const db = getFirestore();
    const audience = parseAudienceParam(req.query['audience']);
    const announced = await readAnnouncedCourses(db, tenantId, todayStoreDate());
    const courses = filterCoursesByAudience(announced, audience);

    const result = await Promise.all(courses.map(async (course) => {
      const snap = await db.collection('calevents')
        .where('tenants', 'array-contains', tenantId)
        .where('courseKey', '==', course.key)
        .get();
      return toPublicCourse(course, snap.docs.map(d => d.data() as Partial<CalEventModel>));
    }));

    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
    res.json(result);
  } catch (err) {
    logger.error('publicApi /courses error', { tenantId, err });
    res.status(500).json({ error: { code: 'internal_error', message: 'Failed to fetch courses' } });
  }
}
